const { Queue } = require('bullmq');
const { redisConfig, redis } = require('../config/redis');

const QUEUE_NAME = 'subscription-reminders';
const isTestOrMock =
  (process.env.NODE_ENV === 'test' && process.env.USE_REAL_REDIS !== 'true') ||
  process.env.USE_MOCK_REDIS === 'true';

let reminderQueue;

if (isTestOrMock) {
  // Test queue adapter mimicking BullMQ Queue interface for isolated testing without live Redis daemon
  reminderQueue = {
    name: QUEUE_NAME,
    jobs: [],
    async add(name, data, opts = {}) {
      const job = {
        id: opts.jobId || `mock-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        data,
        opts,
        attemptsMade: 0
      };
      this.jobs.push(job);
      return job;
    },
    async close() {
      this.jobs = [];
    },
    on() {
      return this;
    }
  };
} else {
  let connection;
  if (typeof redisConfig === 'string') {
    connection = redis;
  } else {
    connection = redisConfig;
  }

  reminderQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        count: 100
      },
      removeOnFail: {
        count: 500
      }
    }
  });
}

module.exports = {
  reminderQueue,
  QUEUE_NAME
};
