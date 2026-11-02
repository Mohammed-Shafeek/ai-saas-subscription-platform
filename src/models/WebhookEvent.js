const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WebhookEvent = sequelize.define('WebhookEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  stripeEventId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  eventType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'webhook_events',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['stripeEventId']
    }
  ]
});

module.exports = WebhookEvent;

