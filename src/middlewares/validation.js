const { AppError } = require('./errorHandler');

const validateCheckoutSessionInput = (req, res, next) => {
  const { email, name, planId } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Customer name is required');
  }

  if (!planId || typeof planId !== 'string') {
    errors.push('A valid planId is required');
  }

  if (errors.length > 0) {
    return next(new AppError('Invalid checkout request payload', 400, errors));
  }

  req.body.email = email.trim().toLowerCase();
  req.body.name = name.trim();
  next();
};

module.exports = {
  validateCheckoutSessionInput
};

