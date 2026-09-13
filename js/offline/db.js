/**
 * js/offline/db.js
 * Centralized IndexedDB storage layer for NexRide.
 * Manages:
 *  1. 'cache': Key-value store for structured application data (buses, routes, stops, profile, reports, etc.)
 *  2. 'outbox': Mutation queue for offline operations with idempotency and retry metadata.
 */

const DB_NAME = 'nexride_offline_db';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const OUTBOX_STORE = 'outbox';

let dbPromise = null;

export function openOfflineDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('[OfflineDB] IndexedDB is not available in this environment.');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Cache Store: { key: string, data: any, cachedAt: number, version: number }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }

      // 2. Outbox Store: { id: string, type: string, payload: any, createdAt: number, retryCount: number, status: string }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outboxStore = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[OfflineDB] Error opening database:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Cache operations
 */

export async function cacheGet(key) {
  const db = await openOfflineDB();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(key);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
        } else {
          resolve({
            data: req.result.data,
            cachedAt: req.result.cachedAt || Date.now(),
            version: req.result.version || 1
          });
        }
      };

      req.onerror = () => {
        console.warn(`[OfflineDB] Failed to read cache for "${key}":`, req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn(`[OfflineDB] Cache get exception for "${key}":`, e);
      resolve(null);
    }
  });
}

export async function cacheSet(key, data, version = 1) {
  const db = await openOfflineDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const item = {
        key,
        data,
        cachedAt: Date.now(),
        version
      };
      const req = store.put(item);

      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn(`[OfflineDB] Failed to set cache for "${key}":`, req.error);
        resolve(false);
      };
    } catch (e) {
      console.warn(`[OfflineDB] Cache set exception for "${key}":`, e);
      resolve(false);
    }
  });
}

export async function cacheDelete(key) {
  const db = await openOfflineDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Outbox queue operations
 */

export async function outboxAdd(operation) {
  const db = await openOfflineDB();
  if (!db) return null;

  const item = {
    id: operation.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
    type: operation.type,
    payload: operation.payload,
    createdAt: Date.now(),
    retryCount: 0,
    status: 'pending' // 'pending' | 'syncing' | 'failed' | 'completed'
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.add(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => {
        console.warn('[OfflineDB] Failed to add item to outbox:', req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('[OfflineDB] Outbox add exception:', e);
      resolve(null);
    }
  });
}

export async function outboxGetPending() {
  const db = await openOfflineDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OUTBOX_STORE, 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = req.result || [];
        const pending = all
          .filter(op => op.status === 'pending' || op.status === 'syncing')
          .sort((a, b) => a.createdAt - b.createdAt);
        resolve(pending);
      };

      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

export async function outboxUpdate(id, updates) {
  const db = await openOfflineDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      const store = tx.objectStore(OUTBOX_STORE);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve(false);
          return;
        }
        const updated = { ...getReq.result, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      getReq.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function outboxRemove(id) {
  const db = await openOfflineDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}
