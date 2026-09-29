/**
 * backend/notification-service.js
 * Production-ready server-side Notification Service for NexRide.
 * Persists notifications to Firestore (nexrideao named database) so they
 * survive server restarts and are visible to the user app via real-time listeners.
 */

import { validateNotificationPayload, NOTIFICATION_TYPES } from '../js/notifications/notification-types.js';

// ─── Firebase Admin Init ────────────────────────────────────────────────────
let adminDb = null;  // Firestore Admin instance
let fcmAdmin = null; // FCM Admin messaging instance

async function getAdminFirestore() {
  if (adminDb) return adminDb;

  const projectId   = process.env.FIREBASE_PROJECT_ID   || 'nexride-ao';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  try {
    const { default: admin } = await import('firebase-admin');

    if (!admin.apps.length) {
      const credentialOpts = clientEmail && privateKey
        ? admin.credential.cert({ projectId, clientEmail, privateKey })
        : admin.credential.applicationDefault();

      admin.initializeApp({ credential: credentialOpts, projectId });
    }

    // Try to get the named 'nexrideao' database (requires firebase-admin >= 11.0)
    try {
      const firestoreModule = await import('firebase-admin/firestore');
      const getFirestoreFn = firestoreModule.getFirestore;
      // Named database support: pass databaseId as second param (Admin SDK v12+)
      adminDb = getFirestoreFn(admin.app(), 'nexrideao');
      console.log('[FCM] Firestore connected to named database: nexrideao');
    } catch (namedDbErr) {
      // Fallback: use default Firestore instance
      // NOTE: This works if your project's default Firestore is the same as nexrideao
      // OR if you only have one Firestore database
      adminDb = admin.firestore();
      console.log('[FCM] Firestore connected (default instance — ensure nexrideao == default or update FIREBASE_DATABASE_ID)');
    }

    fcmAdmin = admin.messaging();
    console.log('[FCM] Firebase Admin + Messaging initialized successfully');
  } catch (err) {
    console.warn('[FCM] Firebase Admin init failed, Firestore-backed notifications unavailable:', err.message);
    adminDb = null;
  }

  return adminDb;
}

// Bootstrap eagerly so the first request doesn't wait
getAdminFirestore().catch(() => {});

// ─── Firestore helpers ──────────────────────────────────────────────────────

async function firestoreAdd(collectionPath, data) {
  const db = await getAdminFirestore();
  if (db) {
    const ref = await db.collection(collectionPath).add(data);
    return ref.id;
  }
  return null;
}

async function firestoreQuery(collectionPath, filters = [], limitN = 50) {
  const db = await getAdminFirestore();
  if (!db) return [];
  let q = db.collection(collectionPath);
  for (const [field, op, value] of filters) {
    q = q.where(field, op, value);
  }
  q = q.orderBy('createdAt', 'desc').limit(limitN);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function firestoreUpdate(collectionPath, docId, data) {
  const db = await getAdminFirestore();
  if (!db) return;
  await db.collection(collectionPath).doc(docId).update(data);
}

// ─── Device token in-memory store (tokens are ephemeral per session) ────────
const devices = new Map(); // token → deviceObject

// ─── Main Service Class ──────────────────────────────────────────────────────

class BackendNotificationService {

  // ===========================================================================
  // 1. DEVICE TOKEN LIFECYCLE MANAGEMENT
  // ===========================================================================

  async registerDevice({ ownerId, ownerType = 'user', token, platform = 'web', deviceId = '' }) {
    if (!ownerId) throw new Error('ownerId is required');
    if (!token)   throw new Error('token is required');
    if (!['user', 'admin'].includes(ownerType)) throw new Error('Invalid ownerType');

    const normalizedDeviceId = deviceId || `dev_${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();

    const deviceRecord = {
      id: `dev_${now}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId,
      ownerType,
      token,
      platform,
      deviceId: normalizedDeviceId,
      active: true,
      createdAt: devices.has(token) ? devices.get(token).createdAt : now,
      updatedAt: now,
      lastUsedAt: now
    };

    devices.set(token, deviceRecord);
    console.log(`[FCM] Token registered for ${ownerType} [${ownerId}] on ${platform}`);
    return deviceRecord;
  }

  async unregisterDevice(token, ownerId) {
    if (!token) return false;
    const device = devices.get(token);
    if (device) {
      if (ownerId && device.ownerId !== ownerId) {
        throw new Error('Unauthorized: Token does not belong to the requesting user');
      }
      device.active = false;
      device.updatedAt = Date.now();
      console.log(`[FCM] Token deactivated for owner [${device.ownerId}]`);
      return true;
    }
    return false;
  }

  getActiveTokensForOwner(ownerId) {
    const tokens = [];
    for (const dev of devices.values()) {
      if (dev.ownerId === ownerId && dev.active) tokens.push(dev.token);
    }
    return tokens;
  }

  getActiveAdminTokens() {
    const tokens = [];
    for (const dev of devices.values()) {
      if (dev.ownerType === 'admin' && dev.active) tokens.push(dev.token);
    }
    return tokens;
  }

  // ===========================================================================
  // 2. NOTIFICATION PERSISTENCE — NOW IN FIRESTORE
  // ===========================================================================

  /**
   * Creates a notification record in Firestore.
   * For all_users broadcasts  → writes to /notifications with target='all_users'
   * For specific users        → writes to /users/{uid}/notifications AND /notifications
   */
  async createNotificationRecord({
    recipientId,
    recipientType = 'user',
    title,
    body,
    type = NOTIFICATION_TYPES.SYSTEM_ALERT,
    data = {},
    eventId = ''
  }) {
    validateNotificationPayload({ title, body });

    const now = Date.now();
    const createdAt = new Date(now).toISOString();

    const record = {
      recipientId,
      recipientType,
      title,
      body,
      type,
      target: recipientId === 'ALL_USERS' ? 'all_users' : recipientId,
      data: { ...data, type, screen: data.screen || 'notifications' },
      read: false,
      readAt: null,
      createdAt,
      sentAt: createdAt,
      status: 'pending'
    };

    // 1. Always write to global /notifications for admin history
    let docId = eventId;
    try {
      const db = await getAdminFirestore();
      if (db) {
        if (docId) {
          await db.collection('notifications').doc(docId).set(record, { merge: true });
        } else {
          docId = await firestoreAdd('notifications', record);
        }
        record.id = docId;
        console.log(`[FCM] Notification saved to Firestore /notifications/${docId}`);
      }
    } catch (err) {
      console.warn('[FCM] Failed to persist notification to Firestore:', err.message);
      record.id = eventId || `notif_${now}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // 2. For specific users also write to /users/{uid}/notifications subcollection
    //    This is what the user app's Firestore onSnapshot listener picks up in real-time
    if (recipientId && recipientId !== 'ALL_USERS' && recipientId !== 'ALL_ADMINS') {
      try {
        const db = await getAdminFirestore();
        if (db) {
          const userNotif = {
            ...record,
            parentNotifId: docId,
            read: false
          };
          await db.collection('users').doc(recipientId).collection('notifications').add(userNotif);
          console.log(`[FCM] Notification also written to /users/${recipientId}/notifications`);
        }
      } catch (err) {
        console.warn(`[FCM] Failed to write to user subcollection for ${recipientId}:`, err.message);
      }
    }

    return record;
  }

  /**
   * Retrieves notification history for a user or admin FROM FIRESTORE.
   * Supports: own notifications + ALL_USERS broadcasts.
   */
  async getNotifications(recipientId, recipientType = 'user', { limit: limitN = 50, unreadOnly = false } = {}) {
    const db = await getAdminFirestore();
    if (!db) {
      console.warn('[FCM] Firestore unavailable — returning empty notifications list');
      return [];
    }

    try {
      const results = [];

      // a) Personal notifications from user subcollection
      if (recipientId && recipientId !== 'anonymous' && recipientType === 'user') {
        try {
          const snap = await db.collection('users').doc(recipientId)
            .collection('notifications').limit(100).get();
          snap.docs.forEach(d => {
            const data = { id: d.id, ...d.data(), _source: 'personal' };
            if (!unreadOnly || !data.read) results.push(data);
          });
        } catch (e) {
          console.warn('[FCM] Error fetching personal notifications:', e.message);
        }
      }

      // b) Global broadcast notifications (target == 'all_users')
      try {
        const bSnap = await db.collection('notifications')
          .where('target', '==', 'all_users').limit(100).get();
        const existingParentIds = new Set(results.map(n => n.parentNotifId).filter(Boolean));
        bSnap.docs.forEach(d => {
          if (!existingParentIds.has(d.id)) {
            const data = { id: d.id, ...d.data(), _source: 'broadcast' };
            results.push(data);
          }
        });
      } catch (e) {
        console.warn('[FCM] Error fetching broadcast notifications:', e.message);
      }

      // Sort newest first (in-memory — avoids composite index requirements)
      results.sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });

      return results.slice(0, limitN);
    } catch (err) {
      console.error('[FCM] Error fetching notifications from Firestore:', err.message);
      return [];
    }
  }


  async getUnreadCount(recipientId, recipientType = 'user') {
    const notifications = await this.getNotifications(recipientId, recipientType, { unreadOnly: true });
    return notifications.length;
  }

  /**
   * Marks a single notification as read in Firestore.
   */
  async markAsRead(notificationId, recipientId) {
    const db = await getAdminFirestore();
    const update = { read: true, readAt: new Date().toISOString() };

    // Try marking in the user's personal subcollection first
    if (recipientId && db) {
      try {
        const userNotifRef = db.collection('users').doc(recipientId)
          .collection('notifications').doc(notificationId);
        const snap = await userNotifRef.get();
        if (snap.exists) {
          await userNotifRef.update(update);
          return { id: notificationId, ...snap.data(), ...update };
        }
      } catch (e) { /* fall through */ }
    }

    // Fall back to global notifications collection
    if (db) {
      try {
        const ref = db.collection('notifications').doc(notificationId);
        const snap = await ref.get();
        if (snap.exists) {
          await ref.update(update);
          return { id: notificationId, ...snap.data(), ...update };
        }
      } catch (e) {
        console.warn('[FCM] markAsRead error:', e.message);
      }
    }

    return null;
  }

  async markAllAsRead(recipientId) {
    if (!recipientId) return 0;
    const db = await getAdminFirestore();
    if (!db) return 0;

    let count = 0;
    const update = { read: true, readAt: new Date().toISOString() };

    // Mark all docs in the user's personal subcollection
    try {
      const snap = await db.collection('users').doc(recipientId)
        .collection('notifications').where('read', '==', false).get();
      const batch = db.batch();
      snap.docs.forEach(d => { batch.update(d.ref, update); count++; });
      if (count > 0) await batch.commit();
    } catch (e) {
      console.warn('[FCM] markAllAsRead subcollection error:', e.message);
    }

    return count;
  }

  // ===========================================================================
  // 3. SERVER-SIDE NOTIFICATION DISPATCH (FCM)
  // ===========================================================================

  async dispatchToTokens(tokens, payload, notificationRecord) {
    if (!tokens || tokens.length === 0) {
      if (notificationRecord) notificationRecord.status = 'no_tokens';
      return { successCount: 0, failureCount: 0 };
    }

    const stringifiedData = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringifiedData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    const messagePayload = {
      notification: { title: payload.title, body: payload.body },
      data: stringifiedData
    };

    let successCount = 0;
    let failureCount = 0;

    if (fcmAdmin) {
      try {
        const response = await fcmAdmin.sendEachForMulticast({ tokens, ...messagePayload });
        successCount = response.successCount;
        failureCount = response.failureCount;

        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            const token = tokens[idx];
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              const dev = devices.get(token);
              if (dev) {
                dev.active = false;
                console.log(`[FCM] Invalid token deactivated: ${token.slice(0, 10)}...`);
              }
            }
          }
        });
      } catch (err) {
        console.error('[FCM] Error sending multicast message:', err.message);
        failureCount = tokens.length;
      }
    } else {
      // Local/Test mode: simulate success
      successCount = tokens.length;
      console.log(`[FCM] (SIMULATED) Notification dispatched to ${tokens.length} device(s)`);
    }

    if (notificationRecord) {
      notificationRecord.status = successCount > 0 ? 'sent' : 'failed';
    }

    return { successCount, failureCount };
  }

  async sendToUser(userId, notification) {
    const record = await this.createNotificationRecord({
      recipientId: userId,
      recipientType: 'user',
      ...notification
    });
    const tokens = this.getActiveTokensForOwner(userId);
    const result = await this.dispatchToTokens(tokens, notification, record);
    return { record, result };
  }

  async sendToAdmin(adminId, notification) {
    const record = await this.createNotificationRecord({
      recipientId: adminId,
      recipientType: 'admin',
      ...notification
    });
    const tokens = this.getActiveTokensForOwner(adminId);
    const result = await this.dispatchToTokens(tokens, notification, record);
    return { record, result };
  }

  async sendToAdmins(notification) {
    const adminTokens = this.getActiveAdminTokens();
    const record = await this.createNotificationRecord({
      recipientId: 'ALL_ADMINS',
      recipientType: 'admin',
      ...notification
    });
    const result = await this.dispatchToTokens(adminTokens, notification, record);
    return { record, result };
  }

  async sendToMultipleUsers(userIds, notification) {
    const results = [];
    for (const uid of userIds) {
      const res = await this.sendToUser(uid, notification);
      results.push(res);
    }
    return results;
  }

  /**
   * Admin broadcast interface with role verification.
   */
  async broadcast({ target, userIds = [], title, body, type = NOTIFICATION_TYPES.GENERAL_ANNOUNCEMENT, data = {} }, adminAuthContext) {
    if (!adminAuthContext || adminAuthContext.role !== 'admin') {
      throw new Error('Forbidden: Broadcast sending requires verified administrator authorization');
    }

    validateNotificationPayload({ title, body });
    console.log(`[FCM] Admin Broadcast by [${adminAuthContext.uid}] → target: ${target}`);

    if (target === 'admins') {
      return await this.sendToAdmins({ title, body, type, data });
    }

    if (target === 'specific_users') {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new Error('userIds must be a non-empty array for specific_users target');
      }
      return await this.sendToMultipleUsers(userIds, { title, body, type, data });
    }

    if (target === 'all_users') {
      const broadcastRecord = await this.createNotificationRecord({
        recipientId: 'ALL_USERS',
        recipientType: 'user',
        title,
        body,
        type,
        data
      });

      // FCM push to all active user devices
      const uniqueUsers = new Set();
      for (const dev of devices.values()) {
        if (dev.ownerType === 'user' && dev.active) uniqueUsers.add(dev.ownerId);
      }
      const userList = Array.from(uniqueUsers);
      const dispatchResults = userList.length > 0
        ? await this.sendToMultipleUsers(userList, { title, body, type, data })
        : [];
      return { broadcastRecord, dispatchResults };
    }

    throw new Error(`Invalid broadcast target: ${target}`);
  }
}

export const notificationService = new BackendNotificationService();
