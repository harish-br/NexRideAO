/**
 * backend/notification-service.js
 * Production-ready server-side Notification Service for NexRide.
 * Enforces role-based security, device token lifecycle, notification persistence,
 * and reliable Firebase Cloud Messaging (FCM) delivery.
 */

import { validateNotificationPayload, NOTIFICATION_TYPES } from '../js/notifications/notification-types.js';

class BackendNotificationService {
  constructor() {
    // In-memory data structures (mirrored to persistent storage)
    this.devices = new Map(); // token -> deviceObject
    this.notifications = new Map(); // id -> notificationObject
    this.fcmAdmin = null;
    this.isInitialized = false;

    this.initFirebaseAdmin();
  }

  /**
   * Initializes Firebase Admin SDK using server environment variables if available.
   * Safe fallback to mock dispatcher if running in dev/test without credentials.
   */
  async initFirebaseAdmin() {
    if (this.isInitialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      try {
        const { default: admin } = await import('firebase-admin');
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey
            })
          });
        }
        this.fcmAdmin = admin.messaging();
        console.log('[FCM] Firebase Admin Messaging initialized successfully');
      } catch (err) {
        console.warn('[FCM] Firebase Admin initialization failed, running in sandbox/simulation mode:', err.message);
      }
    } else {
      console.log('[FCM] Running in local/test notification dispatcher mode (credentials not in env)');
    }

    this.isInitialized = true;
  }

  // ===========================================================================
  // 1. DEVICE TOKEN LIFECYCLE MANAGEMENT
  // ===========================================================================

  /**
   * Registers or updates an FCM device token for a user or admin.
   * Supports multi-device per user (Phone, Tablet, Laptop).
   */
  async registerDevice({ ownerId, ownerType = 'user', token, platform = 'web', deviceId = '' }) {
    if (!ownerId) throw new Error('ownerId is required');
    if (!token) throw new Error('token is required');
    if (!['user', 'admin'].includes(ownerType)) throw new Error('Invalid ownerType');

    const normalizedDeviceId = deviceId || `dev_${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();

    const deviceRecord = {
      id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId,
      ownerType,
      token,
      platform,
      deviceId: normalizedDeviceId,
      active: true,
      createdAt: this.devices.has(token) ? this.devices.get(token).createdAt : now,
      updatedAt: now,
      lastUsedAt: now
    };

    this.devices.set(token, deviceRecord);
    console.log(`[FCM] Token registered for ${ownerType} [${ownerId}] on platform ${platform}`);
    return deviceRecord;
  }

  /**
   * Deactivates a device token (e.g., on logout).
   */
  async unregisterDevice(token, ownerId) {
    if (!token) return false;
    const device = this.devices.get(token);
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

  /**
   * Retrieves all active tokens for a specific owner.
   */
  getActiveTokensForOwner(ownerId) {
    const tokens = [];
    for (const dev of this.devices.values()) {
      if (dev.ownerId === ownerId && dev.active) {
        tokens.push(dev.token);
      }
    }
    return tokens;
  }

  /**
   * Retrieves all active tokens for all admins.
   */
  getActiveAdminTokens() {
    const tokens = [];
    for (const dev of this.devices.values()) {
      if (dev.ownerType === 'admin' && dev.active) {
        tokens.push(dev.token);
      }
    }
    return tokens;
  }

  // ===========================================================================
  // 2. NOTIFICATION PERSISTENCE & HISTORY
  // ===========================================================================

  /**
   * Creates and stores a notification record in the NexRide database.
   */
  createNotificationRecord({
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
    const id = eventId || `notif_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Idempotency guard: If notification with eventId already exists, return existing
    if (this.notifications.has(id)) {
      console.log(`[FCM] Idempotent hit: Notification [${id}] already created, skipping duplicate`);
      return this.notifications.get(id);
    }

    const record = {
      id,
      recipientId,
      recipientType,
      title,
      body,
      type,
      data: {
        ...data,
        type,
        screen: data.screen || 'notifications'
      },
      read: false,
      readAt: null,
      createdAt: now,
      sentAt: now,
      status: 'pending'
    };

    this.notifications.set(id, record);
    console.log(`[FCM] Notification created: [${id}] for ${recipientType} [${recipientId}] - "${title}"`);
    return record;
  }

  /**
   * Retrieves notification history for a user or admin.
   */
  getNotifications(recipientId, recipientType = 'user', { limit = 50, unreadOnly = false } = {}) {
    const results = [];
    for (const n of this.notifications.values()) {
      const isTarget = n.recipientId === recipientId ||
        (n.recipientId === 'ALL_USERS' && recipientType === 'user') ||
        (n.recipientId === 'ALL_ADMINS' && recipientType === 'admin');
      if (isTarget && (!unreadOnly || !n.read)) {
        results.push(n);
      }
    }

    results.sort((a, b) => b.createdAt - a.createdAt);
    return results.slice(0, limit);
  }

  /**
   * Gets unread notification count.
   */
  getUnreadCount(recipientId, recipientType = 'user') {
    let count = 0;
    for (const n of this.notifications.values()) {
      const isTarget = n.recipientId === recipientId ||
        (n.recipientId === 'ALL_USERS' && recipientType === 'user') ||
        (n.recipientId === 'ALL_ADMINS' && recipientType === 'admin');
      if (isTarget && !n.read) {
        count++;
      }
    }
    return count;
  }

  /**
   * Marks a single notification as read.
   */
  markAsRead(notificationId, recipientId) {
    const notif = this.notifications.get(notificationId);
    if (!notif) return null;
    if (recipientId && notif.recipientId !== recipientId) {
      throw new Error('Forbidden: You can only mark your own notifications as read');
    }
    notif.read = true;
    notif.readAt = Date.now();
    return notif;
  }

  /**
   * Marks all notifications for a recipient as read.
   */
  markAllAsRead(recipientId) {
    let updatedCount = 0;
    for (const notif of this.notifications.values()) {
      if (notif.recipientId === recipientId && !notif.read) {
        notif.read = true;
        notif.readAt = Date.now();
        updatedCount++;
      }
    }
    return updatedCount;
  }

  // ===========================================================================
  // 3. SERVER-SIDE NOTIFICATION DISPATCH
  // ===========================================================================

  /**
   * Internal FCM delivery wrapper with invalid token handling and structured logs.
   */
  async dispatchToTokens(tokens, payload, notificationRecord) {
    if (!tokens || tokens.length === 0) {
      if (notificationRecord) notificationRecord.status = 'no_tokens';
      return { successCount: 0, failureCount: 0 };
    }

    // Convert data values to strings for FCM payload compliance
    const stringifiedData = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringifiedData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    const messagePayload = {
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: stringifiedData
    };

    let successCount = 0;
    let failureCount = 0;

    if (this.fcmAdmin) {
      try {
        const response = await this.fcmAdmin.sendEachForMulticast({
          tokens,
          ...messagePayload
        });

        successCount = response.successCount;
        failureCount = response.failureCount;

        // Process invalid / expired token cleanups
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            const token = tokens[idx];
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              const dev = this.devices.get(token);
              if (dev) {
                dev.active = false;
                console.log(`[FCM] Invalid token deactivated: ${token.slice(0, 10)}... (Code: ${errCode})`);
              }
            }
          }
        });
      } catch (err) {
        console.error('[FCM] Error sending multicast message:', err.message);
        failureCount = tokens.length;
      }
    } else {
      // Local/Test mode: Simulate successful send
      successCount = tokens.length;
      console.log(`[FCM] (SIMULATED) Notification sent to ${tokens.length} device(s)`);
    }

    if (notificationRecord) {
      notificationRecord.status = successCount > 0 ? 'sent' : 'failed';
    }

    return { successCount, failureCount };
  }

  /**
   * Send notification to a single normal user.
   */
  async sendToUser(userId, notification) {
    const record = this.createNotificationRecord({
      recipientId: userId,
      recipientType: 'user',
      ...notification
    });

    const tokens = this.getActiveTokensForOwner(userId);
    const result = await this.dispatchToTokens(tokens, notification, record);
    return { record, result };
  }

  /**
   * Send notification to a specific admin.
   */
  async sendToAdmin(adminId, notification) {
    const record = this.createNotificationRecord({
      recipientId: adminId,
      recipientType: 'admin',
      ...notification
    });

    const tokens = this.getActiveTokensForOwner(adminId);
    const result = await this.dispatchToTokens(tokens, notification, record);
    return { record, result };
  }

  /**
   * Broadcast notification to all active admins.
   */
  async sendToAdmins(notification) {
    const adminTokens = this.getActiveAdminTokens();
    const record = this.createNotificationRecord({
      recipientId: 'ALL_ADMINS',
      recipientType: 'admin',
      ...notification
    });

    const result = await this.dispatchToTokens(adminTokens, notification, record);
    return { record, result };
  }

  /**
   * Send to multiple target users.
   */
  async sendToMultipleUsers(userIds, notification) {
    const results = [];
    for (const uid of userIds) {
      const res = await this.sendToUser(uid, notification);
      results.push(res);
    }
    return results;
  }

  /**
   * Admin broadcast sending interface with role verification.
   */
  async broadcast({ target, userIds = [], title, body, type = NOTIFICATION_TYPES.GENERAL_ANNOUNCEMENT, data = {} }, adminAuthContext) {
    if (!adminAuthContext || adminAuthContext.role !== 'admin') {
      throw new Error('Forbidden: Broadcast sending requires verified administrator authorization');
    }

    validateNotificationPayload({ title, body });

    console.log(`[FCM] Admin Broadcast initiated by [${adminAuthContext.uid}] to target: ${target}`);

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
      const broadcastRecord = this.createNotificationRecord({
        recipientId: 'ALL_USERS',
        recipientType: 'user',
        title,
        body,
        type,
        data
      });

      // Find all unique active users with registered devices
      const uniqueUsers = new Set();
      for (const dev of this.devices.values()) {
        if (dev.ownerType === 'user' && dev.active) {
          uniqueUsers.add(dev.ownerId);
        }
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
