require('dotenv').config();
const { sequelize, User, Plan, Subscription, Payment, Invoice, WebhookEvent } = require('../models');

const viewDb = async () => {
  try {
    await sequelize.authenticate();
    console.log(`\nConnected to database (${sequelize.getDialect()})\n`);

    // 1. Users
    const users = await User.findAll({ raw: true });
    console.log('=================== USERS ===================');
    console.table(
      users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt
      }))
    );

    // 2. Plans
    const plans = await Plan.findAll({ raw: true });
    console.log('\n=================== PLANS ===================');
    console.table(
      plans.map(p => ({
        id: p.id,
        name: p.name,
        price: `$${Number(p.price).toFixed(2)}`,
        interval: p.billingInterval,
        currency: p.currency.toUpperCase()
      }))
    );

    // 3. Subscriptions
    const subscriptions = await Subscription.findAll({
      include: [
        { model: User, as: 'user', attributes: ['email'] },
        { model: Plan, as: 'plan', attributes: ['name'] }
      ]
    });
    console.log('\n=================== SUBSCRIPTIONS ===================');
    console.table(
      subscriptions.map(s => ({
        id: s.id,
        userEmail: s.user?.email || s.userId,
        planName: s.plan?.name || s.planId,
        status: s.status,
        startDate: s.startDate ? new Date(s.startDate).toLocaleDateString() : 'N/A',
        endDate: s.endDate ? new Date(s.endDate).toLocaleDateString() : 'N/A',
        stripeSubId: s.stripeSubscriptionId || 'N/A'
      }))
    );

    // 4. Payments
    const payments = await Payment.findAll({
      include: [
        { model: User, as: 'user', attributes: ['email'] }
      ]
    });
    console.log('\n=================== PAYMENTS ===================');
    console.table(
      payments.map(p => ({
        id: p.id,
        userEmail: p.user?.email || p.userId,
        amount: `${Number(p.amount).toFixed(2)} ${p.currency.toUpperCase()}`,
        status: p.status,
        stripeSessionId: p.stripeSessionId || 'N/A',
        createdAt: new Date(p.createdAt).toLocaleDateString()
      }))
    );

    // 5. Invoices
    const invoices = await Invoice.findAll({ raw: true });
    console.log('\n=================== INVOICES ===================');
    if (invoices.length === 0) {
      console.log('No invoices generated yet (generated upon checkout webhook).');
    } else {
      console.table(
        invoices.map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          filePath: i.filePath,
          createdAt: new Date(i.createdAt).toLocaleDateString()
        }))
      );
    }

    // 6. Webhook Events
    const events = await WebhookEvent.findAll({ raw: true });
    console.log('\n=================== WEBHOOK EVENTS ===================');
    if (events.length === 0) {
      console.log('No webhook events logged yet (logged upon incoming webhooks).');
    } else {
      console.table(
        events.map(e => ({
          id: e.id,
          stripeEventId: e.stripeEventId,
          eventType: e.eventType,
          processedAt: new Date(e.processedAt).toLocaleString()
        }))
      );
    }

    console.log('\n===============================================\n');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to view database:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  viewDb();
}

module.exports = viewDb;

