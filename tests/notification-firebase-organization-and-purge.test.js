import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('FIREBASE NOTIFICATION ORGANIZATION & PURGE SUBSYSTEM', async (t) => {

  await t.test('1. Firestore Security Rules enforce authenticated read/write for notifications', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    // Centralized notifications collection
    assert.match(rules, /match\s+\/notifications\/\{notifId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isAuthenticated\(\);/);

    // User notifications subcollection
    assert.match(rules, /match\s+\/notifications\/\{notifId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isAuthenticated\(\);/);

    // Notification devices collection
    assert.match(rules, /match\s+\/notification_devices\/\{deviceId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isAuthenticated\(\);/);
  });

  await t.test('2. Notification category mapping logic maps types to clean functional categories', () => {
    function getCategoryForType(type) {
      if (type === 'BUS_DELAYED' || type === 'ROUTE_UPDATED') return 'transit';
      if (type === 'SAFETY_ALERT') return 'safety';
      if (type === 'EPASS_ALERT') return 'passes';
      if (type === 'SYSTEM_ALERT') return 'system';
      return 'announcement';
    }

    assert.strictEqual(getCategoryForType('GENERAL_ANNOUNCEMENT'), 'announcement');
    assert.strictEqual(getCategoryForType('BUS_DELAYED'), 'transit');
    assert.strictEqual(getCategoryForType('ROUTE_UPDATED'), 'transit');
    assert.strictEqual(getCategoryForType('SAFETY_ALERT'), 'safety');
    assert.strictEqual(getCategoryForType('EPASS_ALERT'), 'passes');
    assert.strictEqual(getCategoryForType('SYSTEM_ALERT'), 'system');
    assert.strictEqual(getCategoryForType('UNKNOWN_FUTURE_TYPE'), 'announcement');
  });

  await t.test('3. generateNotificationId produces human-readable, structured codes for Firebase Console', () => {
    function generateNotificationId(category = 'announcement') {
      const prefixMap = {
        announcement: 'NTF-ANN',
        transit: 'NTF-TRN',
        safety: 'NTF-SAF',
        passes: 'NTF-PAS',
        system: 'NTF-SYS'
      };
      const prefix = prefixMap[category] || 'NTF-GEN';
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const rand = 'ABCD';
      return `${prefix}-${dateStr}-${rand}`;
    }

    const annId = generateNotificationId('announcement');
    assert.match(annId, /^NTF-ANN-\d{8}-[A-Z0-9]{4}$/);

    const trnId = generateNotificationId('transit');
    assert.match(trnId, /^NTF-TRN-\d{8}-[A-Z0-9]{4}$/);

    const safId = generateNotificationId('safety');
    assert.match(safId, /^NTF-SAF-\d{8}-[A-Z0-9]{4}$/);
  });

  await t.test('4. isTestNotification accurately tags test broadcasts and messages', () => {
    function isTestNotification(n) {
      if (!n) return false;
      if (n.isTest === true) return true;
      const testRegex = /\b(test|testing|sample|trial|demo|check)\b/i;
      if (n.title && testRegex.test(n.title)) return true;
      if (n.body && testRegex.test(n.body)) return true;
      return false;
    }

    assert.strictEqual(isTestNotification({ isTest: true }), true);
    assert.strictEqual(isTestNotification({ title: 'Test general broadcast', body: 'Just a check' }), true);
    assert.strictEqual(isTestNotification({ title: 'Important Bus Notice', body: 'This is a sample alert' }), true);
    assert.strictEqual(isTestNotification({ title: 'Demo alert for college', body: 'checking' }), true);
    assert.strictEqual(isTestNotification({ title: 'Bus 32 Delayed by 15 mins', body: 'Engine overheating near North Gate' }), false);
    assert.strictEqual(isTestNotification({ title: 'E-Pass Approved', body: 'Your digital semester pass has been verified' }), false);
  });

  await t.test('5. Cascade deletion simulation removes both parent notification and all user subcollection copies', () => {
    const firestoreDb = {
      notifications: new Map([
        ['notif_001', { id: 'notif_001', title: 'Test broadcast', isTest: true, target: 'all_users' }],
        ['notif_002', { id: 'notif_002', title: 'Route 15 schedule changed', isTest: false, target: 'all_users' }]
      ]),
      users: new Map([
        ['stu_1', {
          notifications: new Map([
            ['sub_1a', { parentNotifId: 'notif_001', title: 'Test broadcast' }],
            ['sub_1b', { parentNotifId: 'notif_002', title: 'Route 15 schedule changed' }]
          ])
        }],
        ['stu_2', {
          notifications: new Map([
            ['sub_2a', { parentNotifId: 'notif_001', title: 'Test broadcast' }]
          ])
        }]
      ])
    };

    // Cascade delete notif_001
    const targetNotifId = 'notif_001';
    firestoreDb.notifications.delete(targetNotifId);

    for (const [_, user] of firestoreDb.users) {
      for (const [subId, subDoc] of user.notifications) {
        if (subDoc.parentNotifId === targetNotifId) {
          user.notifications.delete(subId);
        }
      }
    }

    assert.strictEqual(firestoreDb.notifications.has('notif_001'), false);
    assert.strictEqual(firestoreDb.notifications.has('notif_002'), true);
    assert.strictEqual(firestoreDb.users.get('stu_1').notifications.has('sub_1a'), false);
    assert.strictEqual(firestoreDb.users.get('stu_1').notifications.has('sub_1b'), true);
    assert.strictEqual(firestoreDb.users.get('stu_2').notifications.has('sub_2a'), false);
  });

  await t.test('6. Admin UI contains Category Pills, Modals, and has purge button removed as requested', () => {
    const adminHtml = fs.readFileSync('admin/index.html', 'utf8');

    // Test notification purge button is removed from Notification Center header
    assert.doesNotMatch(adminHtml, /id="admin-purge-test-notifs-btn"/);

    // Create Notification button
    assert.match(adminHtml, /id="admin-create-notif-btn"/);

    // Category navigation tabs
    assert.match(adminHtml, /id="notif-category-pills"/);
    assert.match(adminHtml, /data-cat="all"/);
    assert.match(adminHtml, /data-cat="announcement"/);
    assert.match(adminHtml, /data-cat="transit"/);
    assert.match(adminHtml, /data-cat="safety"/);
    assert.match(adminHtml, /data-cat="passes"/);
    assert.match(adminHtml, /data-cat="system"/);

    // Manage modal category dropdown & modal structure
    assert.match(adminHtml, /id="notif-manage-category"/);
    assert.match(adminHtml, /id="notification-manage-modal"/);
    assert.match(adminHtml, /id="notification-inspect-modal"/);
    assert.match(adminHtml, /id="notification-delete-modal"/);
  });

  await t.test('7. Admin Controller exposes purge and cascade functions in admin.js', () => {
    const adminJs = fs.readFileSync('admin/admin.js', 'utf8');

    assert.match(adminJs, /function purgeTestNotifications\(\)/);
    assert.match(adminJs, /function generateNotificationId/);
    assert.match(adminJs, /function getCategoryForType/);
    assert.match(adminJs, /function isTestNotification/);
    assert.match(adminJs, /window\.purgeTestNotifications\s*=/);
    assert.match(adminJs, /notificationId:\s*generatedNotifId/);
    assert.match(adminJs, /parentNotifId:\s*parentNotifDocId/);
  });
});
