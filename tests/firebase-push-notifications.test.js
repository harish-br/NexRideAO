/**
 * tests/firebase-push-notifications.test.js
 * Comprehensive automated verification for NexRide Firebase Push Notification System.
 * Tests device token lifecycle, notification persistence, role security,
 * payload validation, outbox worker idempotency, and service worker routing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { 
  NOTIFICATION_TYPES, 
  NOTIFICATION_ROUTES, 
  resolveNotificationRoute, 
  validateNotificationPayload 
} from '../js/notifications/notification-types.js';
import { notificationService } from '../backend/notification-service.js';
import { NotificationWorker } from '../backend/notification-worker.js';
import { handleNotificationApi } from '../backend/api-router.js';

test('FIREBASE PUSH NOTIFICATIONS: Production System Verification', async (t) => {

  await t.test('1. Architecture & File Structure Integrity', () => {
    assert.ok(fs.existsSync(path.resolve('js/notifications/notification-types.js')), 'notification-types.js must exist');
    assert.ok(fs.existsSync(path.resolve('js/notifications/notification-service.js')), 'js/notifications/notification-service.js must exist');
    assert.ok(fs.existsSync(path.resolve('backend/notification-service.js')), 'backend/notification-service.js must exist');
    assert.ok(fs.existsSync(path.resolve('backend/notification-worker.js')), 'backend/notification-worker.js must exist');
    assert.ok(fs.existsSync(path.resolve('backend/api-router.js')), 'backend/api-router.js must exist');
    assert.ok(fs.existsSync(path.resolve('public/sw.js')), 'public/sw.js must exist');
    assert.ok(fs.existsSync(path.resolve('public/firebase-messaging-sw.js')), 'public/firebase-messaging-sw.js must exist');
  });

  await t.test('2. Device Token Management & Multi-Device Support', async () => {
    const userId = 'user_student_101';

    // Device A (Phone)
    const devA = await notificationService.registerDevice({
      ownerId: userId,
      ownerType: 'user',
      token: 'fcm_token_phone_abc',
      platform: 'android',
      deviceId: 'device_phone_1'
    });
    assert.strictEqual(devA.ownerId, userId);
    assert.strictEqual(devA.active, true);

    // Device B (Laptop)
    const devB = await notificationService.registerDevice({
      ownerId: userId,
      ownerType: 'user',
      token: 'fcm_token_laptop_xyz',
      platform: 'web',
      deviceId: 'device_laptop_2'
    });
    assert.strictEqual(devB.ownerId, userId);

    // Both tokens active for this user
    const tokens = notificationService.getActiveTokensForOwner(userId);
    assert.ok(tokens.includes('fcm_token_phone_abc'));
    assert.ok(tokens.includes('fcm_token_laptop_xyz'));
    assert.strictEqual(tokens.length, 2, 'User must have exactly 2 active devices');

    // Deactivate Phone token on logout
    await notificationService.unregisterDevice('fcm_token_phone_abc', userId);
    const updatedTokens = notificationService.getActiveTokensForOwner(userId);
    assert.strictEqual(updatedTokens.includes('fcm_token_phone_abc'), false, 'Deactivated token must not be included');
    assert.strictEqual(updatedTokens.includes('fcm_token_laptop_xyz'), true, 'Laptop token remains active');
  });

  await t.test('3. Notification Persistence, Read Status & Unread Count', () => {
    const userId = 'user_student_202';

    // Create 2 notifications
    const n1 = notificationService.createNotificationRecord({
      recipientId: userId,
      recipientType: 'user',
      title: 'Bus Arriving Soon',
      body: 'Bus 32 is 2 stops away from Puttamani.',
      type: NOTIFICATION_TYPES.BUS_ARRIVING,
      data: { busId: 'bus_32' }
    });

    const n2 = notificationService.createNotificationRecord({
      recipientId: userId,
      recipientType: 'user',
      title: 'Pass Renewed',
      body: 'Your semester transit pass is now active.',
      type: NOTIFICATION_TYPES.EPASS_RENEWED
    });

    assert.strictEqual(n1.read, false);
    assert.strictEqual(n2.read, false);

    // Verify unread count
    assert.strictEqual(notificationService.getUnreadCount(userId), 2);

    // Mark n1 as read
    notificationService.markAsRead(n1.id, userId);
    assert.strictEqual(notificationService.getUnreadCount(userId), 1);

    // Mark all as read
    notificationService.markAllAsRead(userId);
    assert.strictEqual(notificationService.getUnreadCount(userId), 0);
  });

  await t.test('4. Idempotency Guards Against Duplicate Notifications', () => {
    const eventId = 'evt_unique_bus_arrival_999';
    const notif1 = notificationService.createNotificationRecord({
      recipientId: 'user_student_303',
      title: 'Duplicate Test',
      body: 'Checking idempotency',
      eventId
    });

    const notif2 = notificationService.createNotificationRecord({
      recipientId: 'user_student_303',
      title: 'Duplicate Test (Retry)',
      body: 'Checking idempotency retry',
      eventId
    });

    assert.strictEqual(notif1.id, notif2.id, 'Idempotency must return the identical notification record');
    assert.strictEqual(notif2.title, 'Duplicate Test', 'Initial payload must be preserved');
  });

  await t.test('5. Payload Security Validation (No Sensitive Leaks)', () => {
    // Valid payload
    assert.doesNotThrow(() => {
      validateNotificationPayload({
        title: 'Safe Alert',
        body: 'Safe message content',
        data: { screen: 'live' }
      });
    });

    // Sensitive field rejection
    assert.throws(() => {
      validateNotificationPayload({
        title: 'Compromised Alert',
        body: 'Alert containing credentials',
        data: { password: 'plaintext_password_123' }
      });
    }, /Security Violation/);

    assert.throws(() => {
      validateNotificationPayload({
        title: 'Token Leak',
        body: 'Alert containing accessToken',
        data: { accessToken: 'jwt_secret_token' }
      });
    }, /Security Violation/);
  });

  await t.test('6. Route Whitelist and Safe Navigation Resolution', () => {
    // Known valid route
    const liveRoute = resolveNotificationRoute(NOTIFICATION_TYPES.BUS_ARRIVING, 'bus_32');
    assert.strictEqual(liveRoute, '/#live?id=bus_32');

    const adminRoute = resolveNotificationRoute(NOTIFICATION_TYPES.NEW_USER_REPORT);
    assert.strictEqual(adminRoute, '/admin/#reports');

    // Fallback safe route
    const fallback = resolveNotificationRoute('UNKNOWN_CUSTOM_TYPE');
    assert.strictEqual(fallback, '/#notifications');
  });

  await t.test('7. Role-Based Server-Side Authorization Enforcement', async () => {
    // Non-admin attempting broadcast must be rejected
    const nonAdminContext = { uid: 'student_123', role: 'user' };

    await assert.rejects(async () => {
      await notificationService.broadcast({
        target: 'all_users',
        title: 'Unauthorized Broadcast',
        body: 'Should fail'
      }, nonAdminContext);
    }, /Forbidden/);

    // Admin context succeeds
    const adminContext = { uid: 'admin_harish', role: 'admin' };
    const res = await notificationService.broadcast({
      target: 'admins',
      title: 'Admin Alert',
      body: 'Internal system operational test'
    }, adminContext);

    assert.ok(res, 'Admin broadcast must succeed');
  });

  await t.test('8. Outbox Worker Idempotency & Backoff Queue', async () => {
    const worker = new NotificationWorker({ maxRetries: 3, baseDelayMs: 20 });
    const eventId = 'outbox_evt_unique_123';

    const queued1 = worker.enqueue({
      eventId,
      recipientId: 'admin_test',
      recipientType: 'admin',
      payload: { title: 'Worker Test', body: 'Testing queue delivery' }
    });
    assert.strictEqual(queued1, true);

    // Immediate duplicate enqueue must be rejected by idempotency
    const queued2 = worker.enqueue({
      eventId,
      recipientId: 'admin_test',
      recipientType: 'admin',
      payload: { title: 'Worker Duplicate', body: 'Should be rejected' }
    });
    assert.strictEqual(queued2, false);
  });

  await t.test('9. REST API Router Endpoints Execution', async () => {
    function mockReqRes(method, url, body = null, headers = {}) {
      const req = new EventEmitter();
      req.method = method;
      req.url = url;
      req.headers = headers;

      const res = {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(code, h) {
          this.statusCode = code;
          if (h) Object.assign(this.headers, h);
        },
        end(data) {
          this.body = data || '';
        }
      };

      return { req, res };
    }

    // A. Register device via API
    const { req: r1, res: s1 } = mockReqRes('POST', '/api/notifications/register-device');
    const p1 = handleNotificationApi(r1, s1);
    r1.emit('data', JSON.stringify({
      ownerId: 'stu_api_test',
      ownerType: 'user',
      token: 'fcm_api_token_1',
      platform: 'web'
    }));
    r1.emit('end');
    await p1;

    assert.strictEqual(s1.statusCode, 200);
    const parsed1 = JSON.parse(s1.body);
    assert.strictEqual(parsed1.success, true);
    assert.strictEqual(parsed1.device.ownerId, 'stu_api_test');

    // B. Get unread count via API
    const { req: r2, res: s2 } = mockReqRes('GET', '/api/notifications/unread-count?recipientId=stu_api_test');
    await handleNotificationApi(r2, s2);
    assert.strictEqual(s2.statusCode, 200);
    const parsed2 = JSON.parse(s2.body);
    assert.ok(typeof parsed2.unreadCount === 'number');
  });

  await t.test('10. Service Worker Background Push & Routing Code Verification', () => {
    const swContent = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
    assert.match(swContent, /self\.addEventListener\(['"]push['"]/, 'Must listen to push events');
    assert.match(swContent, /showNotification/, 'Must call showNotification');
    assert.match(swContent, /self\.addEventListener\(['"]notificationclick['"]/, 'Must handle notificationclick');
    assert.match(swContent, /ALLOWED_DESTINATIONS/, 'Must enforce destination whitelist');

    const fcmSwContent = fs.readFileSync(path.resolve('public/firebase-messaging-sw.js'), 'utf8');
    assert.match(fcmSwContent, /importScripts\(['"]\/sw\.js['"]\)/, 'Firebase messaging SW must delegate to /sw.js');
  });

  await t.test('11. Broadcast to ALL_USERS is accessible in user notification center', async () => {
    // Dispatch broadcast to all_users
    const broadcastResult = await notificationService.broadcast({
      target: 'all_users',
      title: 'Campus Route Advisory',
      body: 'Evening buses will depart 10 minutes early.',
      type: NOTIFICATION_TYPES.BUS_DELAY
    }, { uid: 'admin_test', role: 'admin' });

    assert.ok(broadcastResult.broadcastRecord, 'Must produce a broadcastRecord');
    assert.strictEqual(broadcastResult.broadcastRecord.recipientId, 'ALL_USERS');

    // Normal student fetching their notifications must receive the ALL_USERS broadcast
    const studentId = 'student_test_user_777';
    const studentNotifs = notificationService.getNotifications(studentId, 'user');
    const hasBroadcast = studentNotifs.some(n => n.title === 'Campus Route Advisory');
    assert.strictEqual(hasBroadcast, true, 'Student notification center must include ALL_USERS broadcasts');

    // Unread count for student must reflect broadcast
    const unreadCount = notificationService.getUnreadCount(studentId, 'user');
    assert.ok(unreadCount >= 1, 'Unread count must count unread broadcast notifications');
  });

  await t.test('12. Admin broadcast logic persists to Firestore user collections and audit logs', () => {
    const adminCode = fs.readFileSync(path.resolve('admin/admin.js'), 'utf8');
    assert.match(adminCode, /collection\(firestore,\s*['"]notifications['"]\)/, 'Must write to centralized notifications');
    assert.match(adminCode, /collection\(firestore,\s*['"]users['"],\s*uid,\s*['"]notifications['"]\)/, 'Must write to student notifications subcollection');
    assert.match(adminCode, /collection\(firestore,\s*['"]auditLogs['"]\)/, 'Must record notification broadcast in audit logs');
  });

  await t.test('13. Client app notification listener handles dual streams and live toast alerts', () => {
    const reportCode = fs.readFileSync(path.resolve('js/report.js'), 'utf8');
    assert.match(reportCode, /dispatchLiveNotificationAlert/, 'Must have dispatchLiveNotificationAlert function');
    assert.match(reportCode, /notificationClient\.showInAppToast/, 'Must trigger showInAppToast on live notification arrival');
    assert.match(reportCode, /collection\(db,\s*['"]notifications['"]\)/, 'Must listen to broadcast notifications');
    assert.match(reportCode, /notif-permission-banner/, 'Must manage permission prompt banner');

    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.match(indexHtml, /id=["']notif-permission-banner["']/, 'index.html must include permission banner');
    assert.match(indexHtml, /id=["']enable-push-alerts-btn["']/, 'index.html must include enable push button');
  });

  await t.test('14. Admin Notification Center Page & Navigation Verification', () => {
    const adminHtml = fs.readFileSync(path.resolve('admin/index.html'), 'utf8');
    assert.match(adminHtml, /id=["']notifications-view["']/, 'admin/index.html must define #notifications-view');
    assert.match(adminHtml, /data-view=["']notifications-view["']/, 'Navbar must link to notifications-view');
    assert.match(adminHtml, /id=["']notifications-table-body["']/, 'Must have #notifications-table-body');
    assert.match(adminHtml, /id=["']admin-create-notif-btn["']/, 'Must have Create Notification button');
    assert.match(adminHtml, /id=["']notification-manage-modal["']/, 'Must have #notification-manage-modal for create/edit');
    assert.match(adminHtml, /id=["']notification-inspect-modal["']/, 'Must have #notification-inspect-modal for inspecting details');
    assert.match(adminHtml, /id=["']notification-delete-modal["']/, 'Must have #notification-delete-modal for delete confirmation');
  });

  await t.test('15. Admin Notification CRUD Actions & Lifecycle Handlers Verification', () => {
    const adminCode = fs.readFileSync(path.resolve('admin/admin.js'), 'utf8');
    assert.match(adminCode, /function listenToNotifications/, 'Must have listenToNotifications Firestore listener');
    assert.match(adminCode, /function renderNotificationsManagementTable/, 'Must have renderNotificationsManagementTable function');
    assert.match(adminCode, /function openCreateNotificationModal/, 'Must have openCreateNotificationModal function');
    assert.match(adminCode, /function openEditNotificationModal/, 'Must have openEditNotificationModal function');
    assert.match(adminCode, /function openInspectNotificationModal/, 'Must have openInspectNotificationModal function');
    assert.match(adminCode, /function confirmDeleteNotification/, 'Must have confirmDeleteNotification function');
    assert.match(adminCode, /function resendNotification/, 'Must have resendNotification function');
    assert.match(adminCode, /window\.adminEditNotification\s*=/, 'Must expose adminEditNotification to window');
    assert.match(adminCode, /window\.adminDeleteNotification\s*=/, 'Must expose adminDeleteNotification to window');
    assert.match(adminCode, /window\.adminResendNotification\s*=/, 'Must expose adminResendNotification to window');
    assert.match(adminCode, /window\.adminInspectNotification\s*=/, 'Must expose adminInspectNotification to window');
  });
});
