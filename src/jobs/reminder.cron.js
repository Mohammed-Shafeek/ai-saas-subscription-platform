const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, User, Plan } = require('../models');
const { reminderQueue } = require('../queues/reminder.queue');
const { redis } = require('../config/redis');

/**
 * Scan active subscriptions expiring within the next 3 days and enqueue reminder jobs
 */
const checkExpiringSubscriptions = async () => {
  const now = new Date();
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  console.log(`[Cron] Checking subscriptions expiring between ${now.toISOString()} and ${inThreeDays.toISOString()}...`);

  try {
    const expiringSubscriptions = await Subscription.findAll({
      where: {
        status: 'active',
        endDate: {
          [Op.between]: [now, inThreeDays]
        }
      },
      include: [
        { model: User, as: 'user' },
        { model: Plan, as: 'plan' }
      ]
    });

    console.log(`[Cron] Found ${expiringSubscriptions.length} expiring subscription(s).`);

    let queuedCount = 0;
    let skippedCount = 0;

    for (const sub of expiringSubscriptions) {
      if (!sub.user || !sub.plan || !sub.endDate) {
        continue;
      }

      const periodKey = new Date(sub.endDate).toISOString().slice(0, 10);
      const cacheKey = `reminder:sent:${sub.id}:${periodKey}`;

      // Check Redis to avoid sending duplicate reminders for the same subscription and period
      let alreadySent = false;
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          alreadySent = true;
        }
      } catch (redisErr) {
        // Continue if Redis is temporarily unreachable
      }

      if (alreadySent) {
        console.log(`[Cron] Reminder already queued/sent for subscription ${sub.id} (expiry: ${periodKey}), skipping.`);
        skippedCount++;
        continue;
      }

      const diffTime = new Date(sub.endDate).getTime() - now.getTime();
      const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      const jobId = `reminder-${sub.id}-${periodKey}`;

      try {
        await reminderQueue.add(
          'send-renewal-reminder',
          {
            subscriptionId: sub.id,
            userId: sub.user.id,
            userName: sub.user.name,
            userEmail: sub.user.email,
            planName: sub.plan.name,
            endDate: sub.endDate,
            daysRemaining
          },
          {
            jobId,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        );

        // Mark as queued in Redis with 7-day TTL
        try {
          await redis.set(cacheKey, '1', 'EX', 7 * 24 * 60 * 60);
        } catch (setErr) {
          // Non-blocking
        }

        console.log(`[Cron] Enqueued reminder job for subscription ${sub.id} (${daysRemaining} days remaining).`);
        queuedCount++;
      } catch (queueErr) {
        console.error(`[Cron] Failed to enqueue reminder for subscription ${sub.id}:`, queueErr.message);
      }
    }

    return {
      scanned: expiringSubscriptions.length,
      queued: queuedCount,
      skipped: skippedCount
    };
  } catch (error) {
    console.error('[Cron] Error scanning expiring subscriptions:', error.message);
    throw error;
  }
};

/**
 * Start the daily cron job (default 9:00 AM daily: 0 9 * * *)
 */
const startReminderCron = (cronExpression = '0 9 * * *') => {
  console.log(`[Cron] Initializing daily reminder schedule: "${cronExpression}"`);
  const task = cron.schedule(cronExpression, async () => {
    try {
      await checkExpiringSubscriptions();
    } catch (err) {
      console.error('[Cron] Scheduled run encountered an error:', err.message);
    }
  });

  return task;
};

module.exports = {
  checkExpiringSubscriptions,
  startReminderCron
};

