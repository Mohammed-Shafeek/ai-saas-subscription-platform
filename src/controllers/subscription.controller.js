const { Subscription, Plan, Payment } = require('../models');
const { AppError } = require('../middlewares/errorHandler');

const getSubscriptions = async (req, res, next) => {
  try {
    const subscriptions = await Subscription.findAll({
      where: { userId: req.user.id },
      include: [
        { model: Plan, as: 'plan' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    next(error);
  }
};

const getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subscription = await Subscription.findByPk(id, {
      include: [
        { model: Plan, as: 'plan' },
        { model: Payment, as: 'payments' }
      ]
    });

    if (!subscription) {
      throw new AppError(`Subscription not found with ID: ${id}`, 404);
    }

    if (subscription.userId !== req.user.id) {
      throw new AppError('Forbidden: You do not have permission to view this subscription', 403);
    }

    res.status(200).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSubscriptions,
  getSubscriptionById
};

