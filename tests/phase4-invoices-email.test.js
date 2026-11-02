process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const { sequelize, User, Plan, Subscription, Payment, Invoice, WebhookEvent } = require('../src/models');
const invoiceService = require('../src/services/invoice.service');
const emailService = require('../src/services/email.service');
const { transporter } = require('../src/config/email');
const { stripe } = require('../src/config/stripe');
const { getInvoice } = require('../src/controllers/invoice.controller');
const { handleStripeWebhook } = require('../src/controllers/webhook.controller');
const { authenticate } = require('../src/middlewares/auth');
const { createMockReq, createMockRes, executeRoute } = require('./helpers/testUtils');

describe('Phase 4: Invoice Generation and Email Integration', () => {
  let user;
  let otherUser;
  let plan;
  let subscription;
  let payment;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    user = await User.create({
      name: 'Robert Miller',
      email: 'robert.miller@example.com'
    });

    otherUser = await User.create({
      name: 'Other Person',
      email: 'other@example.com'
    });

    plan = await Plan.create({
      name: 'Pro Plan',
      description: 'Pro plan for AI platform',
      price: 49.00,
      currency: 'usd',
      billingInterval: 'month'
    });

    subscription = await Subscription.create({
      userId: user.id,
      planId: plan.id,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000)
    });

    payment = await Payment.create({
      userId: user.id,
      subscriptionId: subscription.id,
      stripeSessionId: 'cs_test_phase4_123',
      stripePaymentIntentId: 'pi_test_phase4_123',
      amount: 49.00,
      currency: 'usd',
      status: 'succeeded'
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('should generate a PDF invoice and store record in database', async () => {
    const invoice = await invoiceService.generateInvoice({
      user,
      plan,
      payment
    });

    expect(invoice.id).toBeDefined();
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
    expect(invoice.filePath).toContain('storage/invoices');

    const fullPath = path.join(process.cwd(), invoice.filePath);
    expect(fs.existsSync(fullPath)).toBe(true);
    const stats = fs.statSync(fullPath);
    expect(stats.size).toBeGreaterThan(500);
  });

  test('should not generate duplicate invoice for the same payment', async () => {
    const initialInvoiceCount = await Invoice.count({ where: { paymentId: payment.id } });
    expect(initialInvoiceCount).toBe(1);

    const duplicateAttempt = await invoiceService.generateInvoice({
      user,
      plan,
      payment
    });

    const finalInvoiceCount = await Invoice.count({ where: { paymentId: payment.id } });
    expect(finalInvoiceCount).toBe(1);
    expect(duplicateAttempt.paymentId).toBe(payment.id);
  });

  test('should send payment confirmation email with invoice attachment', async () => {
    const invoice = await Invoice.findOne({ where: { paymentId: payment.id } });

    jest.spyOn(transporter, 'sendMail').mockResolvedValue({
      messageId: '<test-message-123@mailtrap.io>'
    });

    const result = await emailService.sendPaymentConfirmationEmail({
      user,
      plan,
      subscription,
      payment,
      invoicePath: invoice.filePath
    });

    expect(result.success).toBe(true);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);

    const sentMailArgs = transporter.sendMail.mock.calls[0][0];
    expect(sentMailArgs.to).toBe(user.email);
    expect(sentMailArgs.subject).toContain(plan.name);
    expect(sentMailArgs.attachments.length).toBe(1);
    expect(sentMailArgs.attachments[0].filename).toBe(path.basename(invoice.filePath));

    transporter.sendMail.mockRestore();
  });

  test('should handle email sending errors gracefully without throwing', async () => {
    jest.spyOn(transporter, 'sendMail').mockRejectedValue(new Error('SMTP connection refused'));

    const result = await emailService.sendPaymentConfirmationEmail({
      user,
      plan,
      subscription,
      payment,
      invoicePath: 'nonexistent.pdf'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP connection refused');

    transporter.sendMail.mockRestore();
  });

  describe('GET /api/invoices/:id', () => {
    let invoice;

    beforeAll(async () => {
      invoice = await Invoice.findOne({ where: { paymentId: payment.id } });
    });

    test('should reject request without authentication (401)', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/invoices/${invoice.id}`,
        params: { id: invoice.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getInvoice], req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Missing or invalid authentication credentials');
    });

    test('should reject request from a different user (403 Forbidden)', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/invoices/${invoice.id}`,
        params: { id: invoice.id },
        headers: { 'x-user-id': otherUser.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getInvoice], req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    test('should return invoice details to the authorized user (200)', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/invoices/${invoice.id}`,
        params: { id: invoice.id },
        headers: { 'x-user-id': user.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getInvoice], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(invoice.id);
      expect(res.body.data.invoiceNumber).toBe(invoice.invoiceNumber);
      expect(res.body.data.user.email).toBe(user.email);
    });

    test('should allow downloading the physical PDF file with ?download=true', async () => {
      const req = createMockReq({
        method: 'GET',
        url: `/api/invoices/${invoice.id}?download=true`,
        params: { id: invoice.id },
        query: { download: 'true' },
        headers: { 'x-user-id': user.id }
      });
      const res = createMockRes();
      await executeRoute([authenticate, getInvoice], req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`${invoice.invoiceNumber}.pdf`);
      expect(res.downloadPath).toBeDefined();
    });
  });

  describe('Full Webhook to Invoice & Email integration', () => {
    test('should automatically create invoice and trigger email on checkout.session.completed', async () => {
      const sendMailSpy = jest.spyOn(transporter, 'sendMail').mockResolvedValue({
        messageId: '<webhook-invoice-email@mailtrap.io>'
      });

      const uniqueSessionId = 'cs_test_auto_invoice_888';
      const mockEvent = {
        id: 'evt_auto_invoice_888',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: uniqueSessionId,
            payment_status: 'paid',
            customer: 'cus_auto_888',
            subscription: 'sub_auto_888',
            amount_total: 4900,
            currency: 'usd',
            payment_intent: 'pi_auto_888',
            metadata: {
              userId: user.id,
              planId: plan.id
            }
          }
        }
      };

      jest.spyOn(stripe.webhooks, 'constructEvent').mockReturnValue(mockEvent);
      jest.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
        id: 'sub_auto_888',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000)
      });

      const req = createMockReq({
        method: 'POST',
        url: '/api/webhooks/stripe',
        body: mockEvent,
        headers: { 'stripe-signature': 'valid_sig' }
      });
      const res = createMockRes();
      await executeRoute([handleStripeWebhook], req, res);

      expect(res.statusCode).toBe(200);

      const paymentRecord = await Payment.findOne({ where: { stripeSessionId: uniqueSessionId } });
      expect(paymentRecord).not.toBeNull();

      const invoiceRecord = await Invoice.findOne({ where: { paymentId: paymentRecord.id } });
      expect(invoiceRecord).not.toBeNull();

      const pdfExists = fs.existsSync(path.join(process.cwd(), invoiceRecord.filePath));
      expect(pdfExists).toBe(true);

      expect(sendMailSpy).toHaveBeenCalled();

      stripe.webhooks.constructEvent.mockRestore();
      stripe.subscriptions.retrieve.mockRestore();
      sendMailSpy.mockRestore();
    });
  });
});
