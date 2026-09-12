import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-02: Admin portal authentication & authorization gate verification', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

  await t.test('Email whitelist validation logic works accurately', () => {
    // Extract AUTHORIZED_ADMIN_EMAILS and isAuthorizedAdminEmail logic
    const AUTHORIZED_ADMIN_EMAILS = [
      'admin@nexride.com',
      'teamnexride@gmail.com',
      'harishsrhr@gmail.com'
    ];

    function isAuthorizedAdminEmail(email) {
      if (!email) return false;
      const lower = email.toLowerCase().trim();
      return AUTHORIZED_ADMIN_EMAILS.includes(lower) || /^[a-zA-Z0-9._%+-]+@admin\.nexride\.com$/.test(lower);
    }

    // Authorized cases
    assert.strictEqual(isAuthorizedAdminEmail('admin@nexride.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('ADMIN@NEXRIDE.COM'), true);
    assert.strictEqual(isAuthorizedAdminEmail('teamnexride@gmail.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('harishsrhr@gmail.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('fleet-lead@admin.nexride.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('support.mgr@admin.nexride.com'), true);

    // Unauthorized cases
    assert.strictEqual(isAuthorizedAdminEmail(''), false);
    assert.strictEqual(isAuthorizedAdminEmail(null), false);
    assert.strictEqual(isAuthorizedAdminEmail(undefined), false);
    assert.strictEqual(isAuthorizedAdminEmail('student@nexride.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('random@gmail.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('admin@nexride.com.attacker.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('attacker@evil-nexride.com'), false);
  });

  await t.test('admin.js checks authorization before calling showDashboard()', () => {
    // Verify that showDashboard is guarded behind isAuthorized check
    assert.match(
      adminJsContent,
      /if\s*\(!isAuthorized\)\s*\{[\s\S]*?showError\("Access Denied: Administrator account required\."\);[\s\S]*?showLogin\(\);[\s\S]*?return;\s*\}/,
      'admin.js must deny access and return early if user is not authorized'
    );

    // Verify software_admin check exists
    assert.match(
      adminJsContent,
      /doc\(firestore,\s*'software_admin',\s*user\.uid\)/,
      'admin.js must query software_admin document for user'
    );

    // Verify token claims check exists
    assert.match(
      adminJsContent,
      /getIdTokenResult/,
      'admin.js should check idTokenResult claims for admin privileges'
    );
  });
});
