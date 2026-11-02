require('dotenv').config();
const { startReminderCron, checkExpiringSubscriptions } = require('./reminder.cron');
const { testConnection } = require('../config/database');

const run = async () => {
  try {
    console.log('[Cron Runner] Starting cron service...');
    await testConnection();
    console.log('[Cron Runner] Database connection established.');

    // Optionally run an initial check if configured
    if (process.env.RUN_CRON_ON_STARTUP === 'true') {
      console.log('[Cron Runner] Running startup check for expiring subscriptions...');
      await checkExpiringSubscriptions();
    }

    const schedule = process.env.REMINDER_CRON_SCHEDULE || '0 9 * * *';
    const task = startReminderCron(schedule);

    console.log(`[Cron Runner] Subscription renewal reminder job running on schedule: ${schedule}`);

    const shutdown = () => {
      console.log('[Cron Runner] Stopping scheduled jobs...');
      task.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[Cron Runner] Fatal error:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run();
}

module.exports = { run };

