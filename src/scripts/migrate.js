require('dotenv').config();
const { sequelize, syncDatabase } = require('../models');

const migrate = async () => {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log(`Database connection established (${sequelize.getDialect()}).`);

    console.log('Synchronizing database models...');

    if (sequelize.getDialect() === 'sqlite') {
      // Clean up any stale backup tables from previous interrupted SQLite syncs
      const tables = ['users', 'plans', 'subscriptions', 'payments', 'invoices', 'webhook_events'];
      for (const t of tables) {
        await sequelize.query(`DROP TABLE IF EXISTS \`${t}_backup\``).catch(() => {});
      }
      await syncDatabase();
    } else {
      // PostgreSQL natively supports ALTER TABLE operations
      await syncDatabase({ alter: true });
    }

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
