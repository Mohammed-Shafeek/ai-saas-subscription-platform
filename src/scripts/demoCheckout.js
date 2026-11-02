require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { sequelize, User, Plan, Subscription, Payment, Invoice, WebhookEvent } = require('../models');
const webhookService = require('../services/webhook.service');
const analyticsService = require('../services/analytics.service');

async function runDemo() {
  console.log('\n============================================================');
  console.log('🚀 SAAS PLATFORM: END-TO-END CHECKOUT DEMONSTRATION');
  console.log('============================================================\n');

  try {
    await sequelize.authenticate();
    console.log(`[1/5] Connected to database (${sequelize.getDialect()})`);

    // 1. Pick a plan
    const plan = await Plan.findOne({ where: { name: 'Pro Plan' } }) || await Plan.findOne();
    if (!plan) {
      console.error('❌ No plans found! Please run "npm run db:seed" first.');
      process.exit(1);
    }
    console.log(`[2/5] Selected Subscription Plan: "${plan.name}" ($${Number(plan.price).toFixed(2)} / ${plan.billingInterval})`);

    // 2. Create or find a demo subscriber
    const demoEmail = `subscriber_${Date.now()}@example.com`;
    const demoName = 'Jordan Rivera';
    const [user] = await User.findOrCreate({
      where: { email: demoEmail },
      defaults: { name: demoName, email: demoEmail }
    });
    console.log(`[3/5] Created Demo Customer: ${user.name} (${user.email})`);

    // 3. Construct a realistic Stripe checkout.session.completed webhook payload
    const mockSessionId = `cs_test_demo_${Date.now()}`;
    const mockStripeSubId = `sub_test_demo_${Date.now()}`;
    const mockStripeEventId = `evt_demo_${Date.now()}`;
    const mockCustomerId = `cus_test_demo_${Date.now()}`;

    const simulatedStripeEvent = {
      id: mockStripeEventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: mockSessionId,
          customer: mockCustomerId,
          subscription: mockStripeSubId,
          payment_status: 'paid',
          amount_total: Math.round(Number(plan.price) * 100),
          currency: plan.currency,
          metadata: {
            userId: user.id,
            planId: plan.id
          }
        }
      }
    };

    console.log('\n[4/5] Processing Stripe Webhook (`checkout.session.completed`)...');
    console.log('   ↳ Verifying payment status: PAID');
    console.log('   ↳ Activating subscription record in database...');
    console.log('   ↳ Storing payment transaction...');
    console.log('   ↳ Generating branded PDF invoice via PDFKit...');
    console.log('   ↳ Dispatching confirmation email with PDF attachment via Nodemailer...');
    console.log('   ↳ Invalidating Redis analytics cache...');

    const result = await webhookService.processEvent(simulatedStripeEvent);
    console.log(`   ✅ Webhook processed successfully:`, result);

    // 4. Retrieve created records
    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: mockStripeSubId },
      include: [{ model: Plan, as: 'plan' }]
    });

    const payment = await Payment.findOne({
      where: { subscriptionId: subscription.id }
    });

    const invoice = await Invoice.findOne({
      where: { paymentId: payment.id }
    });

    console.log('\n[5/5] 🎉 CHECKOUT & FULFILLMENT COMPLETE! RESULTS:');
    console.log('------------------------------------------------------------');
    console.log('📦 Subscription Status :', subscription.status.toUpperCase());
    console.log('📅 Active Period       :', `${new Date(subscription.startDate).toLocaleDateString()} -> ${new Date(subscription.endDate).toLocaleDateString()}`);
    console.log('💳 Payment Amount      :', `$${Number(payment.amount).toFixed(2)} ${(payment.currency || 'usd').toUpperCase()}`);
    console.log('🧾 Invoice Number      :', invoice.invoiceNumber);
    console.log('📄 Invoice PDF Path    :', invoice.filePath);

    if (invoice.filePath && fs.existsSync(invoice.filePath)) {
      const stats = fs.statSync(invoice.filePath);
      console.log('📊 Invoice File Size   :', `${(stats.size / 1024).toFixed(2)} KB (Generated & Stored)`);
    }

    // 5. Check real-time analytics
    const activeSubs = await analyticsService.getActiveSubscribers({ forceRefresh: true });
    const totalRev = await analyticsService.getTotalRevenue({ forceRefresh: true });

    console.log('\n📈 REAL-TIME PLATFORM ANALYTICS:');
    console.log('------------------------------------------------------------');
    console.log('👥 Active Subscribers  :', activeSubs.activeSubscribers);
    console.log('💰 Total Revenue       :', totalRev.summary || '$0.00');
    console.log('⚡ Redis Cache Status  : Cache Evicted & Recalculated');
    console.log('============================================================\n');

    console.log('💡 TIP FOR VIDEO DEMO:');
    console.log('1. Show this terminal execution: `npm run demo:checkout`');
    console.log(`2. Open the generated PDF: "${invoice.filePath}"`);
    console.log('3. Inspect all updated rows in the database: `npm run db:view`\n');

  } catch (error) {
    console.error('❌ Error during demo checkout execution:', error);
  } finally {
    await sequelize.close();
  }
}

runDemo();
