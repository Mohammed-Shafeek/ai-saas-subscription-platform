process.env.NODE_ENV = 'test';
const { sequelize, User, Plan, Subscription, Payment, WebhookEvent } = require('../src/models');
const { stripe } = require('../src/config/stripe');
const { transporter } = require('../src/config/email');
const { createSession } = require('../src/controllers/checkout.controller');
const { handleStripeWebhook } = require('../src/controllers/webhook.controller');
const { validateCheckoutSessionInput } = require('../src/middlewares/validation');
const { createMockReq, createMockRes, executeRoute } = require('./helpers/testUtils');

describe('Phase 3: Stripe Checkout and Webhooks', () => {
  let samplePlan;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    samplePlan = await Plan.create({
      name: 'Pro Plan',
      description: 'Test Pro Plan',
      price: 49.00,
      currency: 'usd',
      billingInterval: 'month'
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/checkout/create-session', () => {
    test('should reject request with missing fields', async () => {
      const req = createMockReq({ method: 'POST', url: '/api/checkout/create-session', body: {} });
      const res = createMockRes();
      await executeRoute([validateCheckoutSessionInput, createSession], req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid checkout request payload');
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    test('should reject request with invalid email', async () => {
      const req = createMockReq({
        method: 'POST',
        url: '/api/checkout/create-session',
        body: {
          name: 'Alice',
          email: 'not-an-email',
          planId: samplePlan.id
        }
      });
      const res = createMockRes();
      await executeRoute([validateCheckoutSessionInput, createSession], req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toContain('A valid email address is required');
    });

    test('should return 404 if planId does not exist', async () => {
      const nonExistentPlanId = '00000000-0000-0000-0000-000000000000';
      const req = createMockReq({
        method: 'POST',
        url: '/api/checkout/create-session',
        body: {
          name: 'Alice',
          email: 'alice@example.com',
          planId: nonExistentPlanId
        }
      });
      const res = createMockRes();
      await executeRoute([validateCheckoutSessionInput, createSession], req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('Subscription plan not found');
    });

    test('should successfully create checkout session with valid plan and user', async () => {
      jest.spyOn(stripe.customers, 'create').mockResolvedValue({
        id: 'cus_mock_alice_123'
      });

      jest.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
        id: 'cs_test_mock_session_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_mock_session_123'
      });

      const req = createMockReq({
        method: 'POST',
        url: '/api/checkout/create-session',
        body: {
          name: 'Alice Cooper',
          email: 'alice@example.com',
          planId: samplePlan.id
        }
      });
      const res = createMockRes();
      await executeRoute([validateCheckoutSessionInput, createSession], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe('cs_test_mock_session_123');
      expect(res.body.data.url).toContain('https://checkout.stripe.com');

      const user = await User.findOne({ where: { email: 'alice@example.com' } });
      expect(user).not.toBeNull();
      expect(user.name).toBe('Alice Cooper');

      stripe.customers.create.mockRestore();
      stripe.checkout.sessions.create.mockRestore();
    });
  });

  describe('POST /api/webhooks/stripe', () => {
    test('should fail if stripe-signature header is missing', async () => {
      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: { id: 'evt_123' },
        headers: {}
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Missing stripe-signature header');
    });

    test('should fail if signature verification fails', async () => {
      jest.spyOn(stripe.webhooks, 'constructEvent').mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: { id: 'evt_123' },
        headers: { 'stripe-signature': 'invalid_signature' }
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Webhook signature verification failed');

      stripe.webhooks.constructEvent.mockRestore();
    });

    test('should process checkout.session.completed and activate subscription and payment', async () => {
      const user = await User.findOne({ where: { email: 'alice@example.com' } });

      const mockEvent = {
        id: 'evt_test_checkout_completed_999',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_paid_session_999',
            payment_status: 'paid',
            customer: 'cus_mock_alice_123',
            subscription: 'sub_mock_alice_123',
            amount_total: 4900,
            currency: 'usd',
            payment_intent: 'pi_test_mock_intent_999',
            metadata: {
              userId: user.id,
              planId: samplePlan.id
            }
          }
        }
      };

      jest.spyOn(stripe.webhooks, 'constructEvent').mockReturnValue(mockEvent);
      jest.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
        id: 'sub_mock_alice_123',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000)
      });
      jest.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'mock-id' });

      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: mockEvent,
        headers: { 'stripe-signature': 'valid_mock_signature' }
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);

      const subscription = await Subscription.findOne({
        where: { userId: user.id, planId: samplePlan.id }
      });
      expect(subscription).not.toBeNull();
      expect(subscription.status).toBe('active');
      expect(subscription.stripeCustomerId).toBe('cus_mock_alice_123');
      expect(subscription.stripeSubscriptionId).toBe('sub_mock_alice_123');

      const payment = await Payment.findOne({
        where: { stripeSessionId: 'cs_test_paid_session_999' }
      });
      expect(payment).not.toBeNull();
      expect(payment.status).toBe('succeeded');
      expect(Number(payment.amount)).toBe(49.00);

      const webhookLog = await WebhookEvent.findOne({
        where: { stripeEventId: 'evt_test_checkout_completed_999' }
      });
      expect(webhookLog).not.toBeNull();

      stripe.webhooks.constructEvent.mockRestore();
      stripe.subscriptions.retrieve.mockRestore();
      transporter.sendMail.mockRestore();
    });

    test('should prevent duplicate processing when same event is received again', async () => {
      const mockDuplicateEvent = {
        id: 'evt_test_checkout_completed_999',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_paid_session_999',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripe.webhooks, 'constructEvent').mockReturnValue(mockDuplicateEvent);

      const paymentsCountBefore = await Payment.count();

      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: mockDuplicateEvent,
        headers: { 'stripe-signature': 'valid_mock_signature' }
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.alreadyProcessed).toBe(true);

      const paymentsCountAfter = await Payment.count();
      expect(paymentsCountAfter).toBe(paymentsCountBefore);

      stripe.webhooks.constructEvent.mockRestore();
    });

    test('should ignore checkout.session.completed if payment_status is not paid', async () => {
      const unpaidEvent = {
        id: 'evt_unpaid_session_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_unpaid_session_123',
            payment_status: 'unpaid',
            metadata: {
              userId: 'some-user',
              planId: samplePlan.id
            }
          }
        }
      };

      jest.spyOn(stripe.webhooks, 'constructEvent').mockReturnValue(unpaidEvent);

      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: unpaidEvent,
        headers: { 'stripe-signature': 'valid_mock_signature' }
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);

      const payment = await Payment.findOne({
        where: { stripeSessionId: 'cs_unpaid_session_123' }
      });
      expect(payment).toBeNull();

      stripe.webhooks.constructEvent.mockRestore();
    });
  });
});
