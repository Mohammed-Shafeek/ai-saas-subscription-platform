const { stripe } = require('../config/stripe');
const { User, Plan, Subscription } = require('../models');
const { AppError } = require('../middlewares/errorHandler');

class StripeService {
  /**
   * Create a Stripe Checkout Session for subscription purchase
   */
  async createCheckoutSession({ name, email, planId, successUrl, cancelUrl }) {
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      throw new AppError(`Subscription plan not found with ID: ${planId}`, 404);
    }

    // Find or create the user record
    let [user] = await User.findOrCreate({
      where: { email },
      defaults: { name, email }
    });

    if (user.name !== name) {
      user.name = name;
      await user.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const finalSuccessUrl = successUrl || `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${frontendUrl}/cancel`;

    try {
      // Check existing customer ID from prior subscriptions or create a new Stripe customer
      let stripeCustomerId = null;
      const existingSubscription = await Subscription.findOne({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']]
      });

      if (existingSubscription && existingSubscription.stripeCustomerId) {
        stripeCustomerId = existingSubscription.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: user.id
          }
        });
        stripeCustomerId = customer.id;
      }

      // Create Checkout Session with Stripe test mode
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [
          {
            price_data: {
              currency: plan.currency,
              product_data: {
                name: plan.name,
                description: plan.description || `${plan.name} SaaS Subscription`
              },
              unit_amount: Math.round(Number(plan.price) * 100), // Stripe expects cents
              recurring: {
                interval: plan.billingInterval
              }
            },
            quantity: 1
          }
        ],
        metadata: {
          userId: user.id,
          planId: plan.id
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            planId: plan.id
          }
        },
        success_url: finalSuccessUrl,
        cancel_url: finalCancelUrl
      });

      return {
        sessionId: session.id,
        url: session.url
      };
    } catch (stripeErr) {
      // Graceful fallback for offline development or placeholder Stripe credentials
      const isPlaceholder = !process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET_KEY.includes('placeholder') ||
        process.env.STRIPE_SECRET_KEY.includes('dummy');

      if (process.env.NODE_ENV !== 'production' && (isPlaceholder || stripeErr.message?.includes('API Key'))) {
        const mockSessionId = `cs_test_mock_${Date.now()}`;
        console.warn(`[StripeService] Real Stripe API skipped (${stripeErr.message}). Returning local interactive checkout page.`);
        return {
          sessionId: mockSessionId,
          url: `${frontendUrl}/checkout?session_id=${mockSessionId}&plan_id=${plan.id}&user_id=${user.id}`
        };
      }
      throw stripeErr;
    }
  }
}

module.exports = new StripeService();

