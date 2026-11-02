process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const { sequelize, User, Plan, Subscription, Payment, Invoice, WebhookEvent } = require('../src/models');
const { stripe } = require('../src/config/stripe');
const { transporter } = require('../src/config/email');
const { createMockReq, createMockRes, executeRoute } = require('./helpers/testUtils');
const { createSession } = require('../src/controllers/checkout.controller');
const { handleStripeWebhook } = require('../src/controllers/webhook.controller');
const { getInvoice } = require('../src/controllers/invoice.controller');
const { getSubscriptions, getSubscriptionById } = require('../src/controllers/subscription.controller');
const { getActiveSubscribers, getTotalRevenue } = require('../src/controllers/analytics.controller');
const { validateCheckoutSessionInput } = require('../src/middlewares/validation');
const { authenticate } = require('../src/middlewares/auth');
const { createMcpServer } = require('../src/mcp/server');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { reminderQueue } = require('../src/queues/reminder.queue');
const { checkExpiringSubscriptions } = require('../src/jobs/reminder.cron');
const { redis } = require('../src/config/redis');

describe('Phase 8: End-to-End System Verification', () => {
  let plan;
  let mcpClient;
  let mcpServer;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    plan = await Plan.create({
      name: 'Pro SaaS Plan',
      description: 'Full featured tier with AI analytics',
      price: 99.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    mcpServer = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: 'test-mcp', version: '1.0.0' }, { capabilities: {} });
    await mcpServer.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close().catch(() => {});
    await mcpServer.close().catch(() => {});
    await reminderQueue.close().catch(() => {});
    if (redis && typeof redis.quit === 'function') {
      await redis.quit().catch(() => {});
    }
    await sequelize.close();
  });

  test('Full Customer Journey: Checkout -> Webhook -> Invoice & Email -> Analytics -> MCP', async () => {
    // 1. Customer initiates checkout session
    jest.spyOn(stripe.customers, 'create').mockResolvedValue({ id: 'cus_e2e_customer_1' });
    jest.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
      id: 'cs_test_e2e_session_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_e2e_session_1'
    });

    const checkoutReq = createMockReq({
      method: 'POST',
      url: '/api/checkout/create-session',
      body: {
        name: 'Bruce Wayne',
        email: 'bruce.wayne@example.com',
        planId: plan.id
      }
    });
    const checkoutRes = createMockRes();
    await executeRoute([validateCheckoutSessionInput, createSession], checkoutReq, checkoutRes);

    expect(checkoutRes.statusCode).toBe(200);
    expect(checkoutRes.body.data.sessionId).toBe('cs_test_e2e_session_1');

    const createdUser = await User.findOne({ where: { email: 'bruce.wayne@example.com' } });
    expect(createdUser).not.toBeNull();

    // 2. Stripe Webhook arrives with verified payment
    const sendMailSpy = jest.spyOn(transporter, 'sendMail').mockResolvedValue({
      messageId: '<e2e-mail-1@mailtrap.io>'
    });

    const mockWebhookEvent = {
      id: 'evt_test_e2e_event_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_e2e_session_1',
          payment_status: 'paid',
          customer: 'cus_e2e_customer_1',
          subscription: 'sub_test_e2e_sub_1',
          amount_total: 9900, // $99.00
          currency: 'usd',
          payment_intent: 'pi_test_e2e_intent_1',
          metadata: {
            userId: createdUser.id,
            planId: plan.id
          }
        }
      }
    };

    jest.spyOn(stripe.webhooks, 'constructEvent').mockReturnValue(mockWebhookEvent);
    jest.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
      id: 'sub_test_e2e_sub_1',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 2 * 86400000) / 1000) // expires in 2 days (for cron test)
    });

    const webhookReq = createMockReq({
      method: 'POST',
      url: '/api/webhooks/stripe',
      body: mockWebhookEvent,
      headers: { 'stripe-signature': 'sig_mock_valid' }
    });
    const webhookRes = createMockRes();
    await executeRoute([handleStripeWebhook], webhookReq, webhookRes);

    expect(webhookRes.statusCode).toBe(200);
    expect(webhookRes.body.processed).toBe(true);

    // Verify database state: Subscription active, Payment succeeded
    const activeSub = await Subscription.findOne({ where: { userId: createdUser.id } });
    expect(activeSub).not.toBeNull();
    expect(activeSub.status).toBe('active');

    const payment = await Payment.findOne({ where: { stripeSessionId: 'cs_test_e2e_session_1' } });
    expect(payment).not.toBeNull();
    expect(payment.status).toBe('succeeded');
    expect(Number(payment.amount)).toBe(99.00);

    // Verify Invoice was created and PDF exists on disk
    const invoice = await Invoice.findOne({ where: { paymentId: payment.id } });
    expect(invoice).not.toBeNull();
    expect(invoice.invoiceNumber).toMatch(/^INV-/);
    const invoicePdfPath = path.join(process.cwd(), invoice.filePath);
    expect(fs.existsSync(invoicePdfPath)).toBe(true);

    // Verify Email was dispatched with invoice attachment
    expect(sendMailSpy).toHaveBeenCalled();
    const emailArgs = sendMailSpy.mock.calls[0][0];
    expect(emailArgs.to).toBe('bruce.wayne@example.com');
    expect(emailArgs.attachments.length).toBe(1);

    // 3. User accesses their invoice via API
    const invoiceReq = createMockReq({
      method: 'GET',
      url: `/api/invoices/${invoice.id}`,
      params: { id: invoice.id },
      headers: { 'x-user-id': createdUser.id }
    });
    const invoiceRes = createMockRes();
    await executeRoute([authenticate, getInvoice], invoiceReq, invoiceRes);

    expect(invoiceRes.statusCode).toBe(200);
    expect(invoiceRes.body.data.invoiceNumber).toBe(invoice.invoiceNumber);

    // 4. User accesses their subscriptions via API
    const subReq = createMockReq({
      method: 'GET',
      url: '/api/subscriptions',
      headers: { 'x-user-id': createdUser.id }
    });
    const subRes = createMockRes();
    await executeRoute([authenticate, getSubscriptions], subReq, subRes);

    expect(subRes.statusCode).toBe(200);
    expect(subRes.body.data.length).toBe(1);
    expect(subRes.body.data[0].id).toBe(activeSub.id);

    // 5. Analytics API reflects the new subscriber and revenue
    const analyticsSubReq = createMockReq({
      method: 'GET',
      url: '/api/analytics/active-subscribers',
      headers: { 'x-user-id': createdUser.id }
    });
    const analyticsSubRes = createMockRes();
    await executeRoute([authenticate, getActiveSubscribers], analyticsSubReq, analyticsSubRes);

    expect(analyticsSubRes.statusCode).toBe(200);
    expect(analyticsSubRes.body.data.activeSubscribers).toBe(1);

    const analyticsRevReq = createMockReq({
      method: 'GET',
      url: '/api/analytics/total-revenue',
      headers: { 'x-user-id': createdUser.id }
    });
    const analyticsRevRes = createMockRes();
    await executeRoute([authenticate, getTotalRevenue], analyticsRevReq, analyticsRevRes);

    expect(analyticsRevRes.statusCode).toBe(200);
    expect(analyticsRevRes.body.data.breakdown.length).toBe(1);
    expect(analyticsRevRes.body.data.breakdown[0].totalAmount).toBe(99.00);

    // 6. MCP AI Client queries analytics tools
    const mcpSubscribers = await mcpClient.callTool({
      name: 'get_active_subscribers',
      arguments: {}
    });
    const subContent = JSON.parse(mcpSubscribers.content[0].text);
    expect(subContent.activeSubscribers).toBe(1);

    const mcpRevenue = await mcpClient.callTool({
      name: 'get_total_revenue',
      arguments: {}
    });
    const revContent = JSON.parse(mcpRevenue.content[0].text);
    expect(revContent.summary).toContain('99.00 USD');

    // 7. Expiration Reminder Cron detects expiring subscription (expires in 2 days)
    const queueSpy = jest.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'e2e-job-1' });
    const cronStats = await checkExpiringSubscriptions();
    expect(cronStats.scanned).toBe(1);
    expect(cronStats.queued).toBe(1);
    expect(queueSpy).toHaveBeenCalledTimes(1);
    queueSpy.mockRestore();

    // 8. Prevent duplicate webhook processing
    const duplicateWebhookReq = createMockReq({
      method: 'POST',
      url: '/api/webhooks/stripe',
      body: mockWebhookEvent,
      headers: { 'stripe-signature': 'sig_mock_valid' }
    });
    const duplicateWebhookRes = createMockRes();
    await executeRoute([handleStripeWebhook], duplicateWebhookReq, duplicateWebhookRes);

    expect(duplicateWebhookRes.statusCode).toBe(200);
    expect(duplicateWebhookRes.body.alreadyProcessed).toBe(true);

    // Ensure payments count is still 1
    const paymentsCount = await Payment.count({ where: { userId: createdUser.id } });
    expect(paymentsCount).toBe(1);

    // Cleanup spies
    stripe.customers.create.mockRestore();
    stripe.checkout.sessions.create.mockRestore();
    stripe.webhooks.constructEvent.mockRestore();
    stripe.subscriptions.retrieve.mockRestore();
    sendMailSpy.mockRestore();
  });
});

