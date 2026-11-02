require('dotenv').config();
const { sequelize, syncDatabase } = require('../models');

const migrate = async () => {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established.');

    console.log('Synchronizing database models...');
    await syncDatabase({ alter: true });
    console.log('Database migration completed successfully.');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;

