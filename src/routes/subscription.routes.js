const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middlewares/auth');

router.get('/', authenticate, subscriptionController.getSubscriptions);
router.get('/:id', authenticate, subscriptionController.getSubscriptionById);

module.exports = router;

