const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'usd',
    set(value) {
      this.setDataValue('currency', value ? value.toLowerCase() : 'usd');
    }
  },
  billingInterval: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'month',
    validate: {
      isIn: [['month', 'year']]
    }
  }
}, {
  tableName: 'plans',
  timestamps: true
});

module.exports = Plan;

