const fs = require('fs');
const path = require('path');

describe('Phase 1: Project Setup & Configuration', () => {
  test('Project directories should exist', () => {
    const expectedDirs = [
      'src/config',
      'src/models',
      'src/controllers',
      'src/routes',
      'src/services',
      'src/middlewares',
      'src/jobs',
      'src/queues',
      'src/utils',
      'src/mcp',
      'storage/invoices'
    ];

    for (const dir of expectedDirs) {
      const fullPath = path.join(__dirname, '..', dir);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  test('docker-compose.yml should be present and define postgres and redis', () => {
    const dockerComposePath = path.join(__dirname, '..', 'docker-compose.yml');
    expect(fs.existsSync(dockerComposePath)).toBe(true);
    const content = fs.readFileSync(dockerComposePath, 'utf8');
    expect(content).toContain('postgres:16-alpine');
    expect(content).toContain('redis:7-alpine');
    expect(content).toContain('5432:5432');
    expect(content).toContain('6379:6379');
  });

  test('.env.example should define all required environment keys', () => {
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, 'utf8');
    const requiredKeys = [
      'PORT',
      'DATABASE_URL',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'FRONTEND_URL',
      'REDIS_URL',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'EMAIL_FROM'
    ];
    for (const key of requiredKeys) {
      expect(content).toContain(key);
    }
  });

  test('Database configuration exports Sequelize instance with proper settings', () => {
    const { sequelize } = require('../src/config/database');
    expect(sequelize).toBeDefined();
    expect(typeof sequelize.authenticate).toBe('function');
  });

  test('Redis configuration exports Redis client', () => {
    const { redis } = require('../src/config/redis');
    expect(redis).toBeDefined();
    expect(typeof redis.get).toBe('function');
    expect(typeof redis.set).toBe('function');
  });

  test('Stripe configuration exports Stripe instance and webhook secret', () => {
    const { stripe, stripeWebhookSecret } = require('../src/config/stripe');
    expect(stripe).toBeDefined();
    expect(stripe.checkout).toBeDefined();
    expect(typeof stripeWebhookSecret).toBe('string');
  });

  test('Email configuration exports Nodemailer transporter and emailFrom', () => {
    const { transporter, emailFrom } = require('../src/config/email');
    expect(transporter).toBeDefined();
    expect(typeof transporter.sendMail).toBe('function');
    expect(typeof emailFrom).toBe('string');
  });

  afterAll(async () => {
    const { redis } = require('../src/config/redis');
    const { sequelize } = require('../src/config/database');
    if (redis && typeof redis.quit === 'function') {
      await redis.quit().catch(() => {});
    }
    if (sequelize && typeof sequelize.close === 'function') {
      await sequelize.close().catch(() => {});
    }
  });
});
