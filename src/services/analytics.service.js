const { sequelize, Subscription, Payment } = require('../models');
const cacheService = require('./cache.service');

const CACHE_KEYS = {
  ACTIVE_SUBSCRIBERS: 'analytics:active_subscribers',
  TOTAL_REVENUE: 'analytics:total_revenue'
};

const DEFAULT_TTL_SECONDS = 60;

class AnalyticsService {
  constructor() {
    this.cacheKeys = CACHE_KEYS;
    this.defaultTtl = DEFAULT_TTL_SECONDS;
  }

  /**
   * Get active subscriber count with Redis caching (60s TTL)
   */
  async getActiveSubscribers({ forceRefresh = false } = {}) {
    if (forceRefresh) {
      await cacheService.del(CACHE_KEYS.ACTIVE_SUBSCRIBERS);
    }

    return await cacheService.getOrSet(
      CACHE_KEYS.ACTIVE_SUBSCRIBERS,
      async () => {
        const count = await Subscription.count({
          where: {
            status: 'active'
          }
        });

        return {
          activeSubscribers: count
        };
      },
      this.defaultTtl
    );
  }

  /**
   * Get total revenue from successful payments only, grouped by currency, with Redis caching (60s TTL)
   * Strictly excludes failed, pending, and refunded payments.
   * Does not mix different currencies into one misleading total.
   */
  async getTotalRevenue({ currency = null, forceRefresh = false } = {}) {
    if (forceRefresh) {
      await cacheService.del(CACHE_KEYS.TOTAL_REVENUE);
    }

    const data = await cacheService.getOrSet(
      CACHE_KEYS.TOTAL_REVENUE,
      async () => {
        const rows = await Payment.findAll({
          attributes: [
            'currency',
            [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
          ],
          where: {
            status: 'succeeded'
          },
          group: ['currency'],
          raw: true
        });

        const breakdown = rows.map((r) => {
          const curr = (r.currency || 'usd').toLowerCase();
          const total = parseFloat(Number(r.totalAmount || 0).toFixed(2));
          const count = parseInt(r.transactionCount || '0', 10);
          return {
            currency: curr,
            totalAmount: total,
            transactionCount: count,
            formatted: `${total.toFixed(2)} ${curr.toUpperCase()}`
          };
        });

        return {
          breakdown,
          summary: breakdown.length > 0
            ? breakdown.map((b) => b.formatted).join(', ')
            : '0.00 USD'
        };
      },
      this.defaultTtl
    );

    // If specific currency filter was requested by caller/tool
    if (currency) {
      const normalizedCurr = currency.toLowerCase();
      const match = data.breakdown.find((b) => b.currency === normalizedCurr);
      return {
        ...data,
        currency: normalizedCurr,
        totalAmount: match ? match.totalAmount : 0.0,
        transactionCount: match ? match.transactionCount : 0,
        formatted: match ? match.formatted : `0.00 ${normalizedCurr.toUpperCase()}`
      };
    }

    return data;
  }

  /**
   * Invalidate all analytics caches upon payment or subscription state changes
   */
  async invalidateAnalyticsCache() {
    console.log('[AnalyticsService] Invalidating analytics cache (active_subscribers, total_revenue)...');
    await cacheService.delKeys([
      CACHE_KEYS.ACTIVE_SUBSCRIBERS,
      CACHE_KEYS.TOTAL_REVENUE
    ]);
  }
}

module.exports = new AnalyticsService();

