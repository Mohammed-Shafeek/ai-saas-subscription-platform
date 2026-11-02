const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkout.controller');
const { validateCheckoutSessionInput } = require('../middlewares/validation');

router.post('/create-session', validateCheckoutSessionInput, checkoutController.createSession);
router.post('/simulate-payment', checkoutController.simulatePayment);

module.exports = router;
