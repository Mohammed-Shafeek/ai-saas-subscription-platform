process.env.NODE_ENV = 'test';
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { createMcpServer } = require('../src/mcp/server');
const { sequelize, User, Plan, Subscription, Payment } = require('../src/models');
const analyticsService = require('../src/services/analytics.service');
const cacheService = require('../src/services/cache.service');
const { redis } = require('../src/config/redis');

describe('Phase 7: MCP Server and Analytics Tools', () => {
  let client;
  let server;
  let clientTransport;
  let serverTransport;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await cacheService.delKeys([
      analyticsService.cacheKeys.ACTIVE_SUBSCRIBERS,
      analyticsService.cacheKeys.TOTAL_REVENUE
    ]);

    // Seed test data
    const user1 = await User.create({ name: 'Clark Kent', email: 'clark.kent@example.com' });
    const user2 = await User.create({ name: 'Diana Prince', email: 'diana.prince@example.com' });

    const proPlan = await Plan.create({
      name: 'Pro Tier',
      price: 50.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    const enterprisePlan = await Plan.create({
      name: 'Enterprise Tier',
      price: 200.00,
      currency: 'eur',
      billingInterval: 'month'
    });

    // 2 active subscriptions
    await Subscription.create({
      userId: user1.id,
      planId: proPlan.id,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000)
    });

    await Subscription.create({
      userId: user2.id,
      planId: enterprisePlan.id,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000)
    });

    // 1 canceled subscription
    await Subscription.create({
      userId: user1.id,
      planId: proPlan.id,
      status: 'canceled',
      startDate: new Date(),
      endDate: new Date()
    });

    // Payments:
    // USD: 2 succeeded ($50 + $50 = $100), 1 failed ($50), 1 pending ($50)
    await Payment.create({ userId: user1.id, amount: 50.00, currency: 'usd', status: 'succeeded' });
    await Payment.create({ userId: user1.id, amount: 50.00, currency: 'usd', status: 'succeeded' });
    await Payment.create({ userId: user1.id, amount: 50.00, currency: 'usd', status: 'failed' });
    await Payment.create({ userId: user1.id, amount: 50.00, currency: 'usd', status: 'pending' });

    // EUR: 1 succeeded (€200)
    await Payment.create({ userId: user2.id, amount: 200.00, currency: 'eur', status: 'succeeded' });

    // Initialize MCP Client and Server via InMemoryTransport
    server = createMcpServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'test-ai-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
    await cacheService.delKeys([
      analyticsService.cacheKeys.ACTIVE_SUBSCRIBERS,
      analyticsService.cacheKeys.TOTAL_REVENUE
    ]);
    if (redis && typeof redis.quit === 'function') {
      await redis.quit().catch(() => {});
    }
    await sequelize.close();
  });

  test('should list only the two authorized analytics tools', async () => {
    const response = await client.listTools();

    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBe(2);

    const toolNames = response.tools.map(t => t.name);
    expect(toolNames).toContain('get_active_subscribers');
    expect(toolNames).toContain('get_total_revenue');
    expect(toolNames).not.toContain('execute_sql');
    expect(toolNames).not.toContain('query_users');
  });

  test('Tool 1: get_active_subscribers should return active subscriber count', async () => {
    const result = await client.callTool({
      name: 'get_active_subscribers',
      arguments: {}
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.activeSubscribers).toBe(2);
    expect(parsed.fromCache).toBe(false);

    // Call again to verify Redis caching
    const cachedResult = await client.callTool({
      name: 'get_active_subscribers',
      arguments: {}
    });
    const cachedParsed = JSON.parse(cachedResult.content[0].text);
    expect(cachedParsed.activeSubscribers).toBe(2);
    expect(cachedParsed.fromCache).toBe(true);
  });

  test('Tool 2: get_total_revenue should return separated currency totals and exclude failed payments', async () => {
    const result = await client.callTool({
      name: 'get_total_revenue',
      arguments: { forceRefresh: true }
    });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.breakdown).toBeDefined();
    expect(parsed.breakdown.length).toBe(2);

    const usdBreakdown = parsed.breakdown.find(b => b.currency === 'usd');
    expect(usdBreakdown).toBeDefined();
    expect(usdBreakdown.totalAmount).toBe(100.00); // 2 * $50
    expect(usdBreakdown.transactionCount).toBe(2);

    const eurBreakdown = parsed.breakdown.find(b => b.currency === 'eur');
    expect(eurBreakdown).toBeDefined();
    expect(eurBreakdown.totalAmount).toBe(200.00);
    expect(eurBreakdown.transactionCount).toBe(1);

    // Currency values must never be mixed into one misleading number
    expect(parsed.summary).toContain('100.00 USD');
    expect(parsed.summary).toContain('200.00 EUR');
  });

  test('Tool 2: get_total_revenue with currency argument should filter by requested currency', async () => {
    const result = await client.callTool({
      name: 'get_total_revenue',
      arguments: { currency: 'usd' }
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filteredCurrency).toBe('usd');
    expect(parsed.totalAmount).toBe(100.00);
    expect(parsed.formatted).toBe('100.00 USD');
  });

  test('should throw error when calling an unauthorized or unknown tool', async () => {
    await expect(
      client.callTool({
        name: 'drop_database',
        arguments: {}
      })
    ).rejects.toThrow();
  });
});

