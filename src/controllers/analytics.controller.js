const analyticsService = require('../services/analytics.service');

const getActiveSubscribers = async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await analyticsService.getActiveSubscribers({ forceRefresh });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getTotalRevenue = async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const currency = req.query.currency || null;
    const result = await analyticsService.getTotalRevenue({ currency, forceRefresh });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveSubscribers,
  getTotalRevenue
};

