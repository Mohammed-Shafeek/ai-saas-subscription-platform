const Stripe = require('stripe');
require('dotenv').config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_initialization';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy_secret';

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-12-18.acacia'
});

module.exports = {
  stripe,
  stripeWebhookSecret
};

