const express = require('express');
const router = express.Router();

const checkoutRoutes = require('./checkout.routes');
const webhookRoutes = require('./webhook.routes');
const invoiceRoutes = require('./invoice.routes');
const subscriptionRoutes = require('./subscription.routes');
const analyticsRoutes = require('./analytics.routes');
const { sequelize } = require('../config/database');
const { redis } = require('../config/redis');

router.get('/health', async (req, res) => {
  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await sequelize.authenticate();
  } catch (err) {
    dbStatus = 'unreachable';
  }

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') redisStatus = 'unexpected_response';
  } catch (err) {
    redisStatus = 'unreachable';
  }

  const isHealthy = dbStatus === 'ok';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus
    }
  });
});

router.use('/checkout', checkoutRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
