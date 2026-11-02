require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');
const { testRedisConnection } = require('./config/redis');
const { createReminderWorker } = require('./jobs/reminder.worker');
const { startReminderCron } = require('./jobs/reminder.cron');

const PORT = process.env.PORT || 3000;

const runAll = async () => {
  console.log('====================================================');
  console.log('Starting AI SaaS Subscription & Analytics Platform');
  console.log('====================================================');

  try {
    // 1. Verify Database
    console.log('[1/4] Connecting to database...');
    await testConnection();
    console.log('      Database connected successfully.');

    // 2. Verify Redis
    console.log('[2/4] Verifying Redis connection...');
    await testRedisConnection();
    console.log('      Redis connection verified.');

    // 3. Start Background Worker
    console.log('[3/4] Initializing BullMQ reminder worker...');
    const worker = createReminderWorker();
    console.log('      BullMQ worker is active and listening for jobs.');

    // 4. Start Daily Cron Scheduler
    console.log('[4/4] Starting subscription renewal reminder cron...');
    const schedule = process.env.REMINDER_CRON_SCHEDULE || '0 9 * * *';
    const cronTask = startReminderCron(schedule);
    console.log(`      Cron scheduled: "${schedule}"`);

    // 5. Start HTTP API Server
    const server = app.listen(PORT, () => {
      console.log('====================================================');
      console.log(`🚀 API Server running on: http://localhost:${PORT}`);
      console.log(`   Healthcheck:           http://localhost:${PORT}/api/health`);
      console.log(`   Environment:           ${process.env.NODE_ENV || 'development'}`);
      console.log('====================================================');
    });

    const shutdown = async () => {
      console.log('\nGracefully shutting down all services...');
      if (cronTask && typeof cronTask.stop === 'function') {
        cronTask.stop();
        console.log('Stopped cron scheduler.');
      }
      if (worker && typeof worker.close === 'function') {
        await worker.close();
        console.log('Closed BullMQ worker.');
      }
      server.close(() => {
        console.log('Closed HTTP API server.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Fatal startup error:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  runAll();
}

module.exports = { runAll };

