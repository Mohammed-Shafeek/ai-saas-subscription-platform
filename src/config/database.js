const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';
const isLogging = process.env.DB_LOGGING === 'true';

let sequelize;

if (isTest && process.env.USE_POSTGRES_TEST !== 'true') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
} else if (process.env.DB_DIALECT === 'sqlite' || (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('sqlite'))) {
  const dbPath = process.env.SQLITE_STORAGE || path.join(process.cwd(), 'storage', 'saas_platform.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: isLogging ? console.log : false
  });
} else if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: isLogging ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'saas_platform',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgrespassword',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      dialect: 'postgres',
      logging: isLogging ? console.log : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection
};

