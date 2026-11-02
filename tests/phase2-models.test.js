process.env.NODE_ENV = 'test';
const { sequelize, User, Plan, Subscription, Payment, Invoice, WebhookEvent } = require('../src/models');

describe('Phase 2: Database Models & Associations', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('should create a User and enforce unique email', async () => {
    const user = await User.create({
      name: 'John Doe',
      email: 'john.doe@example.com'
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('john.doe@example.com');

    await expect(
      User.create({
        name: 'Duplicate John',
        email: 'john.doe@example.com'
      })
    ).rejects.toThrow();
  });

  test('should create a Plan and validate pricing and intervals', async () => {
    const plan = await Plan.create({
      name: 'Pro Plan',
      description: 'Full featured SaaS plan',
      price: 49.00,
      currency: 'USD',
      billingInterval: 'month'
    });

    expect(plan.id).toBeDefined();
    expect(Number(plan.price)).toBe(49.00);
    expect(plan.currency).toBe('usd'); // normalized to lowercase

    // Invalid billing interval should fail validation
    await expect(
      Plan.create({
        name: 'Invalid Plan',
        price: 10,
        billingInterval: 'bi-weekly'
      })
    ).rejects.toThrow();
  });

  test('should create Subscription with User and Plan associations', async () => {
    const user = await User.create({
      name: 'Jane Smith',
      email: 'jane.smith@example.com'
    });

    const plan = await Plan.create({
      name: 'Starter Plan',
      price: 19.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription = await Subscription.create({
      userId: user.id,
      planId: plan.id,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      startDate,
      endDate
    });

    expect(subscription.id).toBeDefined();
    expect(subscription.status).toBe('active');

    // Test association loading
    const loadedSub = await Subscription.findByPk(subscription.id, {
      include: [
        { model: User, as: 'user' },
        { model: Plan, as: 'plan' }
      ]
    });

    expect(loadedSub.user).toBeDefined();
    expect(loadedSub.user.email).toBe('jane.smith@example.com');
    expect(loadedSub.plan).toBeDefined();
    expect(loadedSub.plan.name).toBe('Starter Plan');
  });

  test('should create Payment and associate with User and Subscription', async () => {
    const user = await User.findOne({ where: { email: 'jane.smith@example.com' } });
    const subscription = await Subscription.findOne({ where: { userId: user.id } });

    const payment = await Payment.create({
      userId: user.id,
      subscriptionId: subscription.id,
      stripeSessionId: 'cs_test_session_1',
      stripePaymentIntentId: 'pi_test_intent_1',
      amount: 19.00,
      currency: 'usd',
      status: 'succeeded'
    });

    expect(payment.id).toBeDefined();
    expect(payment.status).toBe('succeeded');
    expect(Number(payment.amount)).toBe(19.00);

    const loadedPayment = await Payment.findByPk(payment.id, {
      include: [
        { model: User, as: 'user' },
        { model: Subscription, as: 'subscription' }
      ]
    });

    expect(loadedPayment.user.name).toBe('Jane Smith');
    expect(loadedPayment.subscription.stripeSubscriptionId).toBe('sub_123');
  });

  test('should create Invoice and enforce unique invoiceNumber', async () => {
    const user = await User.findOne({ where: { email: 'jane.smith@example.com' } });
    const payment = await Payment.findOne({ where: { userId: user.id } });

    const invoice = await Invoice.create({
      userId: user.id,
      paymentId: payment.id,
      invoiceNumber: 'INV-2026-0001',
      filePath: 'storage/invoices/INV-2026-0001.pdf'
    });

    expect(invoice.id).toBeDefined();
    expect(invoice.invoiceNumber).toBe('INV-2026-0001');

    // Duplicate invoice number must fail
    await expect(
      Invoice.create({
        userId: user.id,
        paymentId: payment.id,
        invoiceNumber: 'INV-2026-0001',
        filePath: 'storage/invoices/INV-2026-duplicate.pdf'
      })
    ).rejects.toThrow();
  });

  test('should store WebhookEvent and prevent duplicates via unique stripeEventId', async () => {
    const event = await WebhookEvent.create({
      stripeEventId: 'evt_test_unique_123',
      eventType: 'checkout.session.completed',
      processedAt: new Date()
    });

    expect(event.id).toBeDefined();
    expect(event.stripeEventId).toBe('evt_test_unique_123');

    // Duplicate stripeEventId must fail
    await expect(
      WebhookEvent.create({
        stripeEventId: 'evt_test_unique_123',
        eventType: 'checkout.session.completed',
        processedAt: new Date()
      })
    ).rejects.toThrow();
  });

  test('should support transactional execution for related records', async () => {
    const user = await User.findOne({ where: { email: 'jane.smith@example.com' } });
    const plan = await Plan.findOne({ where: { name: 'Starter Plan' } });

    // Ensure transaction rollbacks work as expected
    try {
      await sequelize.transaction(async (t) => {
        const sub = await Subscription.create({
          userId: user.id,
          planId: plan.id,
          status: 'incomplete'
        }, { transaction: t });

        // Intentional failure to trigger rollback
        throw new Error('Simulated failure during checkout transaction');
      });
    } catch (err) {
      expect(err.message).toBe('Simulated failure during checkout transaction');
    }

    const abortedSub = await Subscription.findOne({ where: { status: 'incomplete' } });
    expect(abortedSub).toBeNull();
  });
});

