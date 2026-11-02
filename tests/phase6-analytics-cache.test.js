process.env.NODE_ENV = 'test';
const { sequelize, User, Plan, Subscription, Payment } = require('../src/models');
const analyticsService = require('../src/services/analytics.service');
const cacheService = require('../src/services/cache.service');
const { getActiveSubscribers, getTotalRevenue } = require('../src/controllers/analytics.controller');
const { authenticate } = require('../src/middlewares/auth');
const { createMockReq, createMockRes, executeRoute } = require('./helpers/testUtils');
const { redis } = require('../src/config/redis');

describe('Phase 6: Redis Analytics Caching', () => {
  let user;
  let plan;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await cacheService.delKeys([
      analyticsService.cacheKeys.ACTIVE_SUBSCRIBERS,
      analyticsService.cacheKeys.TOTAL_REVENUE
    ]);

    user = await User.create({
      name: 'Morgan Stanley',
      email: 'morgan.stanley@example.com'
    });

    plan = await Plan.create({
      name: 'Growth Plan',
      description: 'Growth tier',
      price: 99.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    // Create 2 active subscriptions, 1 canceled
    await Subscription.create({
      userId: user.id,
      planId: plan.id,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000)
    });

    await Subscription.create({
      userId: user.id,
      planId: plan.id,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000)
    });

    await Subscription.create({
      userId: user.id,
      planId: plan.id,
      status: 'canceled',
      startDate: new Date(),
      endDate: new Date()
    });

    // Create payments:
    // USD: 2 succeeded ($99 + $99 = $198), 1 failed ($99), 1 pending ($99)
    await Payment.create({
      userId: user.id,
      amount: 99.00,
      currency: 'usd',
      status: 'succeeded'
    });

    await Payment.create({
      userId: user.id,
      amount: 99.00,
      currency: 'usd',
      status: 'succeeded'
    });

    await Payment.create({
      userId: user.id,
      amount: 99.00,
      currency: 'usd',
      status: 'failed'
    });

    await Payment.create({
      userId: user.id,
      amount: 99.00,
      currency: 'usd',
      status: 'pending'
    });

    // EUR: 1 succeeded (€50)
    await Payment.create({
      userId: user.id,
      amount: 50.00,
      currency: 'eur',
      status: 'succeeded'
    });
  });

  afterAll(async () => {
    await cacheService.delKeys([
      analyticsService.cacheKeys.ACTIVE_SUBSCRIBERS,
      analyticsService.cacheKeys.TOTAL_REVENUE
    ]);
    if (redis && typeof redis.quit === 'function') {
      await redis.quit().catch(() => {});
    }
    await sequelize.close();
  });

  describe('Active Subscribers Caching', () => {
    test('should query database on first call and store in Redis', async () => {
      const result = await analyticsService.getActiveSubscribers();

      expect(result.activeSubscribers).toBe(2);
      expect(result.fromCache).toBe(false);
      expect(result.cachedAt).toBeDefined();
    });

    test('should return cached subscriber count on subsequent calls', async () => {
      const result = await analyticsService.getActiveSubscribers();

      expect(result.activeSubscribers).toBe(2);
      expect(result.fromCache).toBe(true);
    });

    test('should re-query database after cache invalidation', async () => {
      // Invalidate cache
      await analyticsService.invalidateAnalyticsCache();

      // Add 1 more active subscription
      await Subscription.create({
        userId: user.id,
        planId: plan.id,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000)
      });

      const result = await analyticsService.getActiveSubscribers();

      expect(result.activeSubscribers).toBe(3);
      expect(result.fromCache).toBe(false);
    });
  });

  describe('Total Revenue Caching & Currency Separation', () => {
    test('should calculate revenue strictly from succeeded payments and separate currencies', async () => {
      const result = await analyticsService.getTotalRevenue({ forceRefresh: true });

      expect(result.fromCache).toBe(false);
      expect(result.breakdown.length).toBe(2);

      const usdRevenue = result.breakdown.find(b => b.currency === 'usd');
      expect(usdRevenue).toBeDefined();
      expect(usdRevenue.totalAmount).toBe(198.00); // 2 * $99
      expect(usdRevenue.transactionCount).toBe(2);

      const eurRevenue = result.breakdown.find(b => b.currency === 'eur');
      expect(eurRevenue).toBeDefined();
      expect(eurRevenue.totalAmount).toBe(50.00);
      expect(eurRevenue.transactionCount).toBe(1);

      // Verify currencies are NOT mixed into one misleading number
      expect(result.summary).toContain('198.00 USD');
      expect(result.summary).toContain('50.00 EUR');
    });

    test('should return cached revenue on subsequent calls', async () => {
      const cachedResult = await analyticsService.getTotalRevenue();

      expect(cachedResult.fromCache).toBe(true);
      expect(cachedResult.breakdown.length).toBe(2);
    });

    test('should support currency filtering without corrupting cache', async () => {
      const usdOnly = await analyticsService.getTotalRevenue({ currency: 'usd' });

      expect(usdOnly.currency).toBe('usd');
      expect(usdOnly.totalAmount).toBe(198.00);
      expect(usdOnly.formatted).toBe('198.00 USD');
    });
  });

  describe('Analytics REST API Endpoints', () => {
    test('GET /api/analytics/active-subscribers should reject unauthenticated requests (401)', async () => {
      const req = createMockReq({ method: 'GET', url: '/api/analytics/active-subscribers' });
      const res = createMockRes();
      await executeRoute([authenticate, getActiveSubscribers], req, res);

      expect(res.statusCode).toBe(401);
    });

    test('GET /api/analytics/active-subscribers should return subscriber count for authenticated users', async () => {
      const req = createMockReq({
        method: 'GET',
        url: '/api/analytics/active-subscribers',
        headers: { 'x-user-id': user.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getActiveSubscribers], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeSubscribers).toBe(3);
    });

    test('GET /api/analytics/total-revenue should return revenue metrics for authenticated users', async () => {
      const req = createMockReq({
        method: 'GET',
        url: '/api/analytics/total-revenue',
        headers: { 'x-user-id': user.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getTotalRevenue], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.breakdown).toBeDefined();
    });
  });
});

