const stripeService = require('../services/stripe.service');

const createSession = async (req, res, next) => {
  try {
    const { name, email, planId, successUrl, cancelUrl } = req.body;
    const session = await stripeService.createCheckoutSession({
      name,
      email,
      planId,
      successUrl,
      cancelUrl
    });

    res.status(200).json({
      success: true,
      data: session
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSession
};

