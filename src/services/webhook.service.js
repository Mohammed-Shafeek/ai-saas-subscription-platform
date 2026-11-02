const { stripe, stripeWebhookSecret } = require('../config/stripe');
const { sequelize, WebhookEvent, Subscription, Payment, User, Plan } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const invoiceService = require('./invoice.service');
const emailService = require('./email.service');
const analyticsService = require('./analytics.service');

class WebhookService {
  /**
   * Verify Stripe signature and construct the event object
   */
  constructEvent(rawBody, signature) {
    if (!signature) {
      throw new AppError('Missing stripe-signature header', 400);
    }

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    } catch (err) {
      throw new AppError(`Webhook signature verification failed: ${err.message}`, 400);
    }
  }

  /**
   * Process verified webhook event idempotently
   */
  async processEvent(event) {
    const existingEvent = await WebhookEvent.findOne({
      where: { stripeEventId: event.id }
    });

    if (existingEvent) {
      return {
        received: true,
        alreadyProcessed: true,
        eventId: event.id
      };
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event);
        break;

      default:
        // Safely record unhandled event types
        await WebhookEvent.create({
          stripeEventId: event.id,
          eventType: event.type,
          processedAt: new Date()
        });
        break;
    }

    return {
      received: true,
      processed: true,
      eventType: event.type
    };
  }

  /**
   * Handle checkout.session.completed event
   */
  async handleCheckoutSessionCompleted(event) {
    const session = event.data.object;

    // Verify payment was actually collected (never trust frontend)
    if (session.payment_status !== 'paid') {
      return;
    }

    const { userId, planId } = session.metadata || {};
    if (!userId || !planId) {
      throw new AppError('Missing required metadata in Stripe checkout session', 400);
    }

    let startDate = new Date();
    let endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // If subscription ID is attached, query Stripe for exact billing period
    if (session.subscription) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        if (stripeSub.current_period_start) {
          startDate = new Date(stripeSub.current_period_start * 1000);
        }
        if (stripeSub.current_period_end) {
          endDate = new Date(stripeSub.current_period_end * 1000);
        }
      } catch (err) {
        // Fallback to calculated dates if Stripe API is unavailable in offline mock
      }
    }

    // Execute atomic transaction for idempotency log, subscription, and payment
    const result = await sequelize.transaction(async (t) => {
      // 1. Record webhook event for idempotency
      await WebhookEvent.create({
        stripeEventId: event.id,
        eventType: event.type,
        processedAt: new Date()
      }, { transaction: t });

      // 2. Activate or update subscription
      let subscription = await Subscription.findOne({
        where: {
          userId,
          planId
        },
        transaction: t
      });

      if (subscription) {
        subscription.stripeCustomerId = session.customer;
        subscription.stripeSubscriptionId = session.subscription || subscription.stripeSubscriptionId;
        subscription.status = 'active';
        subscription.startDate = startDate;
        subscription.endDate = endDate;
        await subscription.save({ transaction: t });
      } else {
        subscription = await Subscription.create({
          userId,
          planId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          status: 'active',
          startDate,
          endDate
        }, { transaction: t });
      }

      // 3. Record successful payment
      const amountInDollars = session.amount_total
        ? (session.amount_total / 100).toFixed(2)
        : '0.00';

      const payment = await Payment.create({
        userId,
        subscriptionId: subscription.id,
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null,
        amount: parseFloat(amountInDollars),
        currency: session.currency || 'usd',
        status: 'succeeded'
      }, { transaction: t });

      return { subscription, payment };
    });

    // Generate Invoice and Send Confirmation Email
    try {
      const user = await User.findByPk(userId);
      const plan = await Plan.findByPk(planId);
      if (user && plan) {
        const invoice = await invoiceService.generateInvoice({
          user,
          plan,
          payment: result.payment
        });

        await emailService.sendPaymentConfirmationEmail({
          user,
          plan,
          subscription: result.subscription,
          payment: result.payment,
          invoicePath: invoice.filePath
        });
      }
    } catch (postPaymentErr) {
      console.error('[Webhook] Post-payment invoice/email handling error:', postPaymentErr.message);
    }

    // Invalidate analytics caches
    await analyticsService.invalidateAnalyticsCache().catch(() => {});

    return result;
  }

  /**
   * Handle customer.subscription.deleted event
   */
  async handleSubscriptionDeleted(event) {
    const stripeSub = event.data.object;

    await sequelize.transaction(async (t) => {
      await WebhookEvent.create({
        stripeEventId: event.id,
        eventType: event.type,
        processedAt: new Date()
      }, { transaction: t });

      const subscription = await Subscription.findOne({
        where: { stripeSubscriptionId: stripeSub.id },
        transaction: t
      });

      if (subscription) {
        subscription.status = 'canceled';
        await subscription.save({ transaction: t });
      }
    });

    await analyticsService.invalidateAnalyticsCache().catch(() => {});
  }

  /**
   * Handle customer.subscription.updated event
   */
  async handleSubscriptionUpdated(event) {
    const stripeSub = event.data.object;

    await sequelize.transaction(async (t) => {
      await WebhookEvent.create({
        stripeEventId: event.id,
        eventType: event.type,
        processedAt: new Date()
      }, { transaction: t });

      const subscription = await Subscription.findOne({
        where: { stripeSubscriptionId: stripeSub.id },
        transaction: t
      });

      if (subscription) {
        if (stripeSub.status === 'active' || stripeSub.status === 'past_due' || stripeSub.status === 'canceled') {
          subscription.status = stripeSub.status;
        }
        if (stripeSub.current_period_end) {
          subscription.endDate = new Date(stripeSub.current_period_end * 1000);
        }
        await subscription.save({ transaction: t });
      }
    });

    await analyticsService.invalidateAnalyticsCache().catch(() => {});
  }
}

module.exports = new WebhookService();

