const { sequelize } = require('../config/database');
const User = require('./User');
const Plan = require('./Plan');
const Subscription = require('./Subscription');
const Payment = require('./Payment');
const Invoice = require('./Invoice');
const WebhookEvent = require('./WebhookEvent');

// User <-> Subscription (1:N)
User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Plan <-> Subscription (1:N)
Plan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
Subscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });

// User <-> Payment (1:N)
User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Subscription <-> Payment (1:N)
Subscription.hasMany(Payment, { foreignKey: 'subscriptionId', as: 'payments' });
Payment.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });

// User <-> Invoice (1:N)
User.hasMany(Invoice, { foreignKey: 'userId', as: 'invoices' });
Invoice.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Payment <-> Invoice (1:1)
Payment.hasOne(Invoice, { foreignKey: 'paymentId', as: 'invoice' });
Invoice.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

const syncDatabase = async (options = {}) => {
  return await sequelize.sync(options);
};

module.exports = {
  sequelize,
  User,
  Plan,
  Subscription,
  Payment,
  Invoice,
  WebhookEvent,
  syncDatabase
};

