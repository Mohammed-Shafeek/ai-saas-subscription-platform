const { redis } = require('../config/redis');

class CacheService {
  /**
   * Retrieve cached item and parse JSON
   */
  async get(key) {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      console.warn(`[CacheService] Failed to get key "${key}":`, err.message);
      return null;
    }
  }

  /**
   * Set item in cache with TTL in seconds
   */
  async set(key, value, ttlSeconds = 60) {
    try {
      const stringified = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.set(key, stringified, 'EX', ttlSeconds);
      } else {
        await redis.set(key, stringified);
      }
      return true;
    } catch (err) {
      console.warn(`[CacheService] Failed to set key "${key}":`, err.message);
      return false;
    }
  }

  /**
   * Delete specific key from cache
   */
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch (err) {
      console.warn(`[CacheService] Failed to del key "${key}":`, err.message);
      return false;
    }
  }

  /**
   * Delete multiple keys or keys matching a prefix
   */
  async delKeys(keys = []) {
    if (!keys || keys.length === 0) return true;
    try {
      await Promise.all(keys.map(k => redis.del(k)));
      return true;
    } catch (err) {
      console.warn('[CacheService] Failed to delete keys:', err.message);
      return false;
    }
  }

  /**
   * Read-through cache pattern: Return cached data if available; otherwise fetch, cache, and return
   */
  async getOrSet(key, fetcherFn, ttlSeconds = 60) {
    const cached = await this.get(key);
    if (cached !== null) {
      return {
        ...cached,
        fromCache: true
      };
    }

    const freshData = await fetcherFn();
    const payloadToCache = {
      ...freshData,
      cachedAt: new Date().toISOString()
    };

    await this.set(key, payloadToCache, ttlSeconds);

    return {
      ...payloadToCache,
      fromCache: false
    };
  }
}

module.exports = new CacheService();

