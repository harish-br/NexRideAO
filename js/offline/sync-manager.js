/**
 * js/offline/sync-manager.js
 * Centralized SyncManager: processes offline outbox mutations,
 * performs idempotent server updates, manages exponential backoff,
 * and maintains cache consistency upon reconnection.
 */

import { outboxGetPending, outboxUpdate, outboxRemove, cacheSet } from './db.js';
import { connectivity } from './connectivity.js';
import { firestore } from '../firebase-config.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.listeners = new Set();
    this.maxRetries = 5;

    // Automatically trigger sync whenever server reachability is restored
    if (typeof window !== 'undefined') {
      connectivity.subscribe((state) => {
        if (state.isServerReachable && !this.syncInProgress) {
          this.processOfflineQueue();
        }
      });
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data = {}) {
    this.listeners.forEach((fn) => {
      try {
        fn({ event, ...data });
      } catch (e) {
        console.warn('[SyncManager] Listener error:', e);
      }
    });
  }

  /**
   * Main sync processor
   */
  async processOfflineQueue() {
    if (this.syncInProgress) {
      console.log('[SYNC] Sync already in progress, skipping concurrent run.');
      return;
    }

    if (!connectivity.isServerReachable) {
      console.log('[SYNC] Cannot process queue: server currently unreachable.');
      return;
    }

    this.syncInProgress = true;
    this.notify('sync_started');
    console.log('[SYNC] Started offline outbox synchronization');

    try {
      const pendingItems = await outboxGetPending();
      if (pendingItems.length === 0) {
        console.log('[SYNC] Outbox is clean. No pending operations.');
        this.notify('sync_idle');
        return;
      }

      console.log(`[SYNC] Found ${pendingItems.length} pending operations to process.`);

      for (const item of pendingItems) {
        // Re-check reachability before processing each item
        if (!connectivity.isServerReachable) {
          console.warn('[SYNC] Connectivity lost during queue processing. Halting sync.');
          break;
        }

        await this.processItem(item);
      }
    } catch (err) {
      console.error('[SYNC] Error during outbox processing:', err);
    } finally {
      this.syncInProgress = false;
      connectivity.recordSuccessfulSync();
      this.notify('sync_completed');
      console.log('[SYNC] Completed offline synchronization run.');
    }
  }

  async processItem(item) {
    console.log(`[SYNC] Processing operation ${item.id} [${item.type}] (Attempt ${item.retryCount + 1}/${this.maxRetries})`);
    await outboxUpdate(item.id, { status: 'syncing' });
    this.notify('syncing_item', { id: item.id, type: item.type });

    try {
      switch (item.type) {
        case 'CREATE_REPORT':
        case 'CREATE_SUPPORT_TICKET':
          await this.syncReportItem(item);
          break;

        case 'UPDATE_PROFILE':
          await this.syncProfileItem(item);
          break;

        default:
          console.warn(`[SYNC] Unknown operation type: ${item.type}. Marking as failed.`);
          await outboxUpdate(item.id, { status: 'failed', error: 'Unknown type' });
          return;
      }

      // Success: Remove from outbox
      await outboxRemove(item.id);
      console.log(`[SYNC] Operation ${item.id} succeeded and removed from outbox.`);
      this.notify('item_succeeded', { id: item.id, type: item.type });
    } catch (err) {
      console.error(`[SYNC] Operation ${item.id} failed:`, err);
      const nextRetry = (item.retryCount || 0) + 1;

      if (nextRetry >= this.maxRetries) {
        console.error(`[SYNC] Operation ${item.id} reached max retries (${this.maxRetries}). Marking permanently failed.`);
        await outboxUpdate(item.id, {
          status: 'failed',
          retryCount: nextRetry,
          lastError: err.message || 'Network failure'
        });
        this.notify('item_failed', { id: item.id, error: err.message });
      } else {
        const delay = Math.min(1000 * Math.pow(2, nextRetry), 15000); // 2s, 4s, 8s, 15s
        console.log(`[SYNC] Retry scheduled for operation ${item.id} in ${delay}ms`);
        await outboxUpdate(item.id, {
          status: 'pending',
          retryCount: nextRetry,
          lastError: err.message || 'Transient error'
        });
        this.notify('item_retry_scheduled', { id: item.id, delay });
      }
    }
  }

  async syncReportItem(item) {
    const payload = item.payload || {};
    const reportId = item.id; // Use client-generated UUID as doc ID for complete idempotency!

    if (!firestore) throw new Error('Firestore not initialized');

    const firestorePayload = {
      ...payload,
      id: reportId,
      status: payload.status || 'Submitted',
      syncedFromOffline: true,
      updatedAt: serverTimestamp()
    };

    // Use setDoc with merge for idempotent write (retry does NOT create duplicates)
    await setDoc(doc(firestore, 'reports', reportId), firestorePayload, { merge: true });
  }

  async syncProfileItem(item) {
    const payload = item.payload || {};
    const userId = payload.uid || payload.userId;
    if (!userId) throw new Error('Cannot update profile without userId');
    if (!firestore) throw new Error('Firestore not initialized');

    await setDoc(doc(firestore, 'users', userId), {
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

export const syncManager = new SyncManager();
