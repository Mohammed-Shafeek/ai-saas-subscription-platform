const Redis = require('ioredis');
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';
const useMock = (isTest && process.env.USE_REAL_REDIS !== 'true') || process.env.USE_MOCK_REDIS === 'true';

let redisClient;
let redisConfig;

if (useMock) {
  const RedisMock = require('ioredis-mock');
  redisClient = new RedisMock();
  redisConfig = redisClient;
} else if (process.env.REDIS_URL) {
  redisConfig = process.env.REDIS_URL;
  redisClient = new Redis(redisConfig, { maxRetriesPerRequest: null });
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };
  redisClient = new Redis(redisConfig);
}

redisClient.on('error', (err) => {
  // Prevent unhandled error crashes when Redis is temporarily unreachable
  if (process.env.NODE_ENV !== 'test') {
    console.error('Redis Client Error:', err.message);
  }
});

const testRedisConnection = async () => {
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis connection failed:', error.message);
    throw error;
  }
};

module.exports = {
  redis: redisClient,
  redisConfig,
  testRedisConnection
};

