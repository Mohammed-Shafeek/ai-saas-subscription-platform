const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middlewares/auth');

router.get('/active-subscribers', authenticate, analyticsController.getActiveSubscribers);
router.get('/total-revenue', authenticate, analyticsController.getTotalRevenue);

module.exports = router;

