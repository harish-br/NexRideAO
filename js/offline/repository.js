/**
 * js/offline/repository.js
 * Central Data Repository for NexRide with Stale-While-Revalidate (SWR).
 * UI components query the repository instead of calling backend APIs directly.
 * Handles cache hits, background refreshes, optimistic offline mutations,
 * and outbox queuing.
 */

import { cacheGet, cacheSet, outboxAdd } from './db.js';
import { connectivity } from './connectivity.js';
import { syncManager } from './sync-manager.js';

// Cache expiration thresholds in milliseconds
const STALE_THRESHOLDS = {
  buses: 30 * 1000,         // 30 seconds
  routes: 5 * 60 * 1000,     // 5 minutes
  stops: 10 * 60 * 1000,     // 10 minutes
  profile: 5 * 60 * 1000,    // 5 minutes
  reports: 1 * 60 * 1000,    // 1 minute
  notifications: 1 * 60 * 1000
};

class NexRideRepository {
  /**
   * Generic SWR fetcher
   */
  async getWithSWR(key, fetcherFn, options = {}) {
    const { onUpdate = null, maxAge = STALE_THRESHOLDS[key] || 60000 } = options;

    // 1. Immediately read from local IndexedDB cache
    const cached = await cacheGet(key);
    const now = Date.now();
    let result = null;

    if (cached && cached.data) {
      const age = now - (cached.cachedAt || 0);
      const isStale = age > maxAge;
      console.log(`[CACHE] Loaded ${key} (cachedAt: ${new Date(cached.cachedAt).toLocaleTimeString()}, age: Math.round(age / 1000)s, stale: ${isStale})`);

      result = {
        data: cached.data,
        cachedAt: cached.cachedAt,
        isFromCache: true,
        isStale
      };

      // If data is still fresh and online, return cached directly
      if (!isStale && !options.forceRefresh) {
        return result;
      }
    }

    // 2. If server is reachable, trigger background or immediate fetch
    if (connectivity.isServerReachable && typeof fetcherFn === 'function') {
      const fetchPromise = (async () => {
        try {
          const freshData = await fetcherFn();
          if (freshData !== undefined && freshData !== null) {
            await cacheSet(key, freshData);
            console.log(`[CACHE] Updated ${key} with fresh server data`);
            connectivity.recordSuccessfulSync();

            const updatedResult = {
              data: freshData,
              cachedAt: Date.now(),
              isFromCache: false,
              isStale: false
            };

            if (typeof onUpdate === 'function') {
              onUpdate(updatedResult);
            }
            return updatedResult;
          }
        } catch (fetchErr) {
          console.warn(`[CACHE] Failed to refresh ${key} from server, preserving cache:`, fetchErr);
        }
        return result;
      })();

      // If we had no cache, wait for fetch. If we had cache, return cache immediately while fetching in background
      if (!result) {
        return await fetchPromise;
      } else {
        // Run fetch in background
        fetchPromise.catch(() => {});
        return result;
      }
    }

    // 3. Offline & no cache exists
    if (!result) {
      console.log(`[OFFLINE] No local cache available for ${key} and device is offline`);
      return {
        data: null,
        cachedAt: null,
        isFromCache: false,
        isStale: true,
        offlineEmpty: true
      };
    }

    return result;
  }

  /**
   * Domain-specific query helpers
   */

  async getBuses(fetcherFn, options = {}) {
    return this.getWithSWR('buses', fetcherFn, options);
  }

  async getRoutes(fetcherFn, options = {}) {
    return this.getWithSWR('routes', fetcherFn, options);
  }

  async getStops(fetcherFn, options = {}) {
    return this.getWithSWR('stops', fetcherFn, options);
  }

  async getProfile(userId, fetcherFn, options = {}) {
    return this.getWithSWR(`profile_${userId || 'current'}`, fetcherFn, options);
  }

  async getReports(userId, fetcherFn, options = {}) {
    return this.getWithSWR(`reports_${userId || 'current'}`, fetcherFn, options);
  }

  /**
   * Domain-specific mutation helpers with Outbox fallback
   */

  async createReport(reportPayload) {
    const reportId = reportPayload.id || `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullPayload = {
      ...reportPayload,
      id: reportId,
      createdAt: reportPayload.createdAt || Date.now(),
      status: reportPayload.status || 'Submitted'
    };

    // Optimistically update local reports cache
    const cacheKey = `reports_${reportPayload.userId || 'current'}`;
    const cached = await cacheGet(cacheKey);
    const existingList = (cached && Array.isArray(cached.data)) ? cached.data : [];
    const updatedList = [fullPayload, ...existingList.filter(r => r.id !== reportId)];
    await cacheSet(cacheKey, updatedList);

    // Enqueue in outbox
    const op = await outboxAdd({
      id: reportId,
      type: 'CREATE_REPORT',
      payload: fullPayload
    });

    console.log(`[REPOSITORY] Enqueued report ${reportId} (offline outbox: ${!!op})`);

    // If online, immediately trigger outbox processing
    if (connectivity.isServerReachable) {
      syncManager.processOfflineQueue().catch(e => console.warn('[REPOSITORY] Immediate sync error:', e));
    }

    return {
      success: true,
      reportId,
      pendingSync: !connectivity.isServerReachable
    };
  }

  async createSupportTicket(ticketPayload) {
    const ticketId = ticketPayload.id || `NR-${Date.now().toString(36).toUpperCase()}`;
    const fullPayload = {
      ...ticketPayload,
      id: ticketId,
      createdAt: ticketPayload.createdAt || Date.now(),
      status: 'Submitted',
      source: 'Help & Support'
    };

    // Optimistically update local tickets cache
    const cacheKey = `tickets_${ticketPayload.userId || 'current'}`;
    const cached = await cacheGet(cacheKey);
    const existingList = (cached && Array.isArray(cached.data)) ? cached.data : [];
    const updatedList = [fullPayload, ...existingList.filter(t => t.id !== ticketId)];
    await cacheSet(cacheKey, updatedList);

    // Enqueue in outbox
    await outboxAdd({
      id: ticketId,
      type: 'CREATE_SUPPORT_TICKET',
      payload: fullPayload
    });

    if (connectivity.isServerReachable) {
      syncManager.processOfflineQueue().catch(e => console.warn('[REPOSITORY] Immediate sync error:', e));
    }

    return {
      success: true,
      ticketId,
      pendingSync: !connectivity.isServerReachable
    };
  }

  async updateProfile(userId, updates) {
    const cacheKey = `profile_${userId || 'current'}`;
    const cached = await cacheGet(cacheKey);
    const existing = (cached && cached.data) ? cached.data : {};
    const merged = { ...existing, ...updates, uid: userId };
    await cacheSet(cacheKey, merged);

    await outboxAdd({
      id: `profile_upd_${Date.now()}`,
      type: 'UPDATE_PROFILE',
      payload: { userId, ...updates }
    });

    if (connectivity.isServerReachable) {
      syncManager.processOfflineQueue().catch(e => console.warn('[REPOSITORY] Immediate sync error:', e));
    }

    return {
      success: true,
      pendingSync: !connectivity.isServerReachable
    };
  }
}

export const repository = new NexRideRepository();
