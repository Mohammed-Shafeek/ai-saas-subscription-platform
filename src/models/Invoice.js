const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  paymentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'payments',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'invoices',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['invoiceNumber'] },
    { fields: ['userId'] },
    { fields: ['paymentId'] }
  ]
});

module.exports = Invoice;

