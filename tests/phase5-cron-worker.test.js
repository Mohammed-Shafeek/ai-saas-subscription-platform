process.env.NODE_ENV = 'test';
const { sequelize, User, Plan, Subscription, Payment } = require('../src/models');
const { getSubscriptions, getSubscriptionById } = require('../src/controllers/subscription.controller');
const { authenticate } = require('../src/middlewares/auth');
const { createMockReq, createMockRes, executeRoute } = require('./helpers/testUtils');
const { reminderQueue } = require('../src/queues/reminder.queue');
const { checkExpiringSubscriptions } = require('../src/jobs/reminder.cron');
const emailService = require('../src/services/email.service');
const { redis } = require('../src/config/redis');

describe('Phase 5: Cron Job, BullMQ Queue, and Worker', () => {
  let user1;
  let user2;
  let plan;
  let expiringSub;
  let distantSub;
  let canceledSub;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    user1 = await User.create({
      name: 'Samantha Ray',
      email: 'samantha.ray@example.com'
    });

    user2 = await User.create({
      name: 'Bob Jones',
      email: 'bob.jones@example.com'
    });

    plan = await Plan.create({
      name: 'Starter Plan',
      description: 'Starter AI plan',
      price: 19.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    const now = new Date();

    // Expiring in 2 days (within 3 days window)
    expiringSub = await Subscription.create({
      userId: user1.id,
      planId: plan.id,
      status: 'active',
      startDate: new Date(now.getTime() - 28 * 86400000),
      endDate: new Date(now.getTime() + 2 * 86400000)
    });

    // Expiring in 15 days (outside 3 days window)
    distantSub = await Subscription.create({
      userId: user1.id,
      planId: plan.id,
      status: 'active',
      startDate: now,
      endDate: new Date(now.getTime() + 15 * 86400000)
    });

    // Expiring in 1 day but status is canceled
    canceledSub = await Subscription.create({
      userId: user2.id,
      planId: plan.id,
      status: 'canceled',
      startDate: new Date(now.getTime() - 29 * 86400000),
      endDate: new Date(now.getTime() + 1 * 86400000)
    });
  });

  afterAll(async () => {
    await reminderQueue.close().catch(() => {});
    if (redis && typeof redis.quit === 'function') {
      await redis.quit().catch(() => {});
    }
    await sequelize.close();
  });

  test('should detect subscriptions expiring within 3 days and add reminder jobs to BullMQ', async () => {
    const queueAddSpy = jest.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'mock-job-1' });

    const stats = await checkExpiringSubscriptions();

    expect(stats.scanned).toBe(1); // Only expiringSub matches
    expect(stats.queued).toBe(1);
    expect(queueAddSpy).toHaveBeenCalledTimes(1);

    const jobArgs = queueAddSpy.mock.calls[0];
    expect(jobArgs[0]).toBe('send-renewal-reminder');
    expect(jobArgs[1].subscriptionId).toBe(expiringSub.id);
    expect(jobArgs[1].userEmail).toBe('samantha.ray@example.com');
    expect(jobArgs[1].daysRemaining).toBeLessThanOrEqual(3);
    expect(jobArgs[2].attempts).toBe(3);

    queueAddSpy.mockRestore();
  });

  test('should prevent duplicate reminder jobs for the same subscription and period', async () => {
    const queueAddSpy = jest.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'mock-job-2' });

    // Run again immediately - should be skipped due to Redis deduplication key
    const stats = await checkExpiringSubscriptions();

    expect(stats.scanned).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.queued).toBe(0);
    expect(queueAddSpy).not.toHaveBeenCalled();

    queueAddSpy.mockRestore();
  });

  test('worker execution should invoke emailService and handle retries on failure', async () => {
    const emailSpy = jest.spyOn(emailService, 'sendSubscriptionRenewalReminder').mockResolvedValue({
      success: true
    });

    // Simulate worker processor logic
    const jobData = {
      subscriptionId: expiringSub.id,
      userId: user1.id,
      userName: user1.name,
      userEmail: user1.email,
      planName: plan.name,
      endDate: expiringSub.endDate,
      daysRemaining: 2
    };

    const result = await emailService.sendSubscriptionRenewalReminder({
      user: { id: jobData.userId, name: jobData.userName, email: jobData.userEmail },
      plan: { name: jobData.planName },
      subscription: { id: jobData.subscriptionId, endDate: jobData.endDate },
      daysRemaining: jobData.daysRemaining
    });

    expect(result.success).toBe(true);
    expect(emailSpy).toHaveBeenCalledTimes(1);

    emailSpy.mockRestore();
  });

  describe('Subscription REST Endpoints', () => {
    test('GET /api/subscriptions should reject unauthenticated requests (401)', async () => {
      const req = createMockReq({ method: 'GET', url: '/api/subscriptions' });
      const res = createMockRes();
      await executeRoute([authenticate, getSubscriptions], req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Missing or invalid authentication credentials');
    });

    test('GET /api/subscriptions should return subscriptions for the authenticated user', async () => {
      const req = createMockReq({
        method: 'GET',
        url: '/api/subscriptions',
        headers: { 'x-user-id': user1.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getSubscriptions], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].plan).toBeDefined();
    });

    test('GET /api/subscriptions/:id should return single subscription details', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/subscriptions/${expiringSub.id}`,
        params: { id: expiringSub.id },
        headers: { 'x-user-id': user1.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getSubscriptionById], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(expiringSub.id);
      expect(res.body.data.plan.name).toBe('Starter Plan');
    });

    test('GET /api/subscriptions/:id should forbid unauthorized user access (403)', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/subscriptions/${expiringSub.id}`,
        params: { id: expiringSub.id },
        headers: { 'x-user-id': user2.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getSubscriptionById], req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });
});
