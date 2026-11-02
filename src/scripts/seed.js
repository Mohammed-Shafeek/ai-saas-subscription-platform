require('dotenv').config();
const { sequelize, User, Plan, Subscription, Payment, Invoice } = require('../models');

const seed = async () => {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();

    console.log('Seeding initial plans...');
    const plansData = [
      {
        name: 'Starter Plan',
        description: 'Ideal for early-stage startups and indie hackers. Includes 100 AI queries/mo.',
        price: 19.00,
        currency: 'usd',
        billingInterval: 'month'
      },
      {
        name: 'Pro Plan',
        description: 'For growing SaaS businesses. Includes 1,000 AI queries/mo and priority analytics.',
        price: 49.00,
        currency: 'usd',
        billingInterval: 'month'
      },
      {
        name: 'Enterprise Plan',
        description: 'For high-scale platforms. Unlimited AI queries, dedicated support, custom integrations.',
        price: 199.00,
        currency: 'usd',
        billingInterval: 'month'
      }
    ];

    const plans = [];
    for (const planData of plansData) {
      let plan = await Plan.findOne({ where: { name: planData.name } });
      if (!plan) {
        plan = await Plan.create(planData);
        console.log(`Created plan: ${plan.name} ($${plan.price})`);
      } else {
        console.log(`Plan already exists: ${plan.name}`);
      }
      plans.push(plan);
    }

    console.log('Seeding demo user...');
    let user = await User.findOne({ where: { email: 'alex.morgan@example.com' } });
    if (!user) {
      user = await User.create({
        name: 'Alex Morgan',
        email: 'alex.morgan@example.com'
      });
      console.log(`Created demo user: ${user.name} (${user.email})`);
    } else {
      console.log(`Demo user already exists: ${user.email}`);
    }

    console.log('Seeding demo subscription...');
    let subscription = await Subscription.findOne({ where: { userId: user.id } });
    if (!subscription) {
      const now = new Date();
      const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      subscription = await Subscription.create({
        userId: user.id,
        planId: plans[1].id, // Pro Plan
        stripeCustomerId: 'cus_demo_test123',
        stripeSubscriptionId: 'sub_demo_test123',
        status: 'active',
        startDate: now,
        endDate: inThirtyDays
      });
      console.log(`Created active demo subscription: ${subscription.id}`);

      console.log('Seeding demo payment...');
      const payment = await Payment.create({
        userId: user.id,
        subscriptionId: subscription.id,
        stripeSessionId: 'cs_test_demo_session_123',
        stripePaymentIntentId: 'pi_test_demo_intent_123',
        amount: plans[1].price,
        currency: 'usd',
        status: 'succeeded'
      });
      console.log(`Created demo payment: ${payment.id} ($${payment.amount})`);
    } else {
      console.log(`Subscription already exists: ${subscription.id}`);
    }

    console.log('Database seeding finished successfully.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seed();
}

module.exports = seed;

