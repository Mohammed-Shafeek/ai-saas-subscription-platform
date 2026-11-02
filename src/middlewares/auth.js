const { User } = require('../models');
const { AppError } = require('./errorHandler');

/**
 * Authentication middleware
 * Supports x-user-id header or Bearer token (where token is user ID or simulated JWT)
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const headerUserId = req.headers['x-user-id'];

    let userId = null;

    if (headerUserId) {
      userId = headerUserId;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = authHeader.split(' ')[1];
    }

    if (!userId) {
      return next(new AppError('Unauthorized: Missing or invalid authentication credentials', 401));
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return next(new AppError('Unauthorized: User not found', 401));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate
};

