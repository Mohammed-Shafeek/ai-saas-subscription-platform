require('dotenv').config();
const { createReminderWorker } = require('./reminder.worker');
const { testRedisConnection } = require('../config/redis');

const runWorker = async () => {
  try {
    console.log('[Worker Runner] Testing Redis connection...');
    await testRedisConnection();
    console.log('[Worker Runner] Redis connection verified.');

    const worker = createReminderWorker();
    console.log('[Worker Runner] Subscription reminder worker started and listening for jobs.');

    const shutdown = async () => {
      console.log('[Worker Runner] Gracefully closing worker...');
      await worker.close();
      console.log('[Worker Runner] Worker closed.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[Worker Runner] Fatal worker startup error:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  runWorker();
}

module.exports = { runWorker };

