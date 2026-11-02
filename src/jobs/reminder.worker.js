const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/reminder.queue');
const { redisConfig, redis } = require('../config/redis');
const emailService = require('../services/email.service');

const createReminderWorker = () => {
  if (process.env.USE_MOCK_REDIS === 'true') {
    console.log('[Worker] Running in local mock mode (processing jobs in-memory).');
    return {
      close: async () => {},
      on: () => {}
    };
  }

  let connection;
  if (typeof redisConfig === 'string') {
    connection = redis;
  } else {
    connection = redisConfig;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      console.log(`[Worker] Processing reminder job ${job.id} for subscription ${job.data.subscriptionId}...`);

      const {
        subscriptionId,
        userId,
        userName,
        userEmail,
        planName,
        endDate,
        daysRemaining
      } = job.data;

      const emailResult = await emailService.sendSubscriptionRenewalReminder({
        user: { id: userId, name: userName, email: userEmail },
        plan: { name: planName },
        subscription: { id: subscriptionId, endDate },
        daysRemaining
      });

      if (!emailResult.success) {
        throw new Error(`Email delivery failed: ${emailResult.error}`);
      }

      console.log(`[Worker] Successfully delivered renewal reminder to ${userEmail} (job ${job.id}).`);
      return {
        sent: true,
        userEmail,
        subscriptionId
      };
    },
    {
      connection,
      concurrency: 5
    }
  );

  worker.on('completed', (job, returnvalue) => {
    console.log(`[Worker] Job ${job.id} finished successfully:`, returnvalue);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Unexpected worker error:', err.message);
  });

  return worker;
};

module.exports = {
  createReminderWorker
};

