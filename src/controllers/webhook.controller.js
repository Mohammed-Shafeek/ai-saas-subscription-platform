const webhookService = require('../services/webhook.service');

const handleStripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    const payload = req.rawBody || req.body;

    const event = webhookService.constructEvent(payload, signature);
    const result = await webhookService.processEvent(event);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleStripeWebhook
};

