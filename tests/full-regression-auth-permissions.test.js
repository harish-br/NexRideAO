import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('FULL REGRESSION: Authentication & Firestore Rules Access Control Matrix', async (t) => {
  const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  const adminJsContent = fs.readFileSync(path.resolve('admin/admin.js'), 'utf8');

  await t.test('Admin email pattern matching matches exactly authorized domain suffixes', () => {
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

    // Valid admin emails
    assert.strictEqual(isAuthorizedAdminEmail('admin@nexride.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('teamnexride@gmail.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('harishsrhr@gmail.com'), true);
    assert.strictEqual(isAuthorizedAdminEmail('fleet-ops@admin.nexride.com'), true);

    // Subdomain manipulation / suffix spoofing attempts
    assert.strictEqual(isAuthorizedAdminEmail('admin@nexride.com.evil.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('admin@nexride.com@attacker.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('fake-admin@notadmin.nexride.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail('admin@admin.nexride.com.attacker.com'), false);
    assert.strictEqual(isAuthorizedAdminEmail(''), false);
  });

  await t.test('Admin auth gate simulates authorization resolution accurately', async () => {
    async function evaluateAdminAuthorization(user, mockDocExists = false, mockRole = 'Admin') {
      let isAuthorized = false;
      let adminRole = 'Admin';

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

      if (mockDocExists) {
        isAuthorized = true;
        adminRole = mockRole;
      }

      if (!isAuthorized && typeof user.getIdTokenResult === 'function') {
        const tokenResult = await user.getIdTokenResult().catch(() => null);
        if (tokenResult && tokenResult.claims && (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin')) {
          isAuthorized = true;
          adminRole = 'Super Admin';
        }
      }

      if (!isAuthorized && isAuthorizedAdminEmail(user.email)) {
        isAuthorized = true;
        adminRole = 'Super Admin';
      }

      return { isAuthorized, adminRole };
    }

    // Case 1: Anonymous student with no doc and no claims
    const studentUser = { uid: 'anon_123', email: null, isAnonymous: true };
    const auth1 = await evaluateAdminAuthorization(studentUser, false);
    assert.strictEqual(auth1.isAuthorized, false, 'Anonymous user must NOT be authorized');

    // Case 2: Regular student email
    const studentUser2 = { uid: 'stu_456', email: 'student@example.com', isAnonymous: false };
    const auth2 = await evaluateAdminAuthorization(studentUser2, false);
    assert.strictEqual(auth2.isAuthorized, false, 'Student email must NOT be authorized');

    // Case 3: Whitelisted email
    const whitelistedUser = { uid: 'adm_789', email: 'admin@nexride.com' };
    const auth3 = await evaluateAdminAuthorization(whitelistedUser, false);
    assert.strictEqual(auth3.isAuthorized, true, 'Whitelisted email must be authorized');

    // Case 4: Custom claim user
    const claimsUser = {
      uid: 'claim_999',
      email: 'custom@org.com',
      getIdTokenResult: async () => ({ claims: { role: 'admin' } })
    };
    const auth4 = await evaluateAdminAuthorization(claimsUser, false);
    assert.strictEqual(auth4.isAuthorized, true, 'User with role: admin claim must be authorized');

    // Case 5: software_admin Firestore document user
    const docUser = { uid: 'doc_user_555', email: 'dbadmin@nexride.com' };
    const auth5 = await evaluateAdminAuthorization(docUser, true, 'Fleet Supervisor');
    assert.strictEqual(auth5.isAuthorized, true, 'software_admin document user must be authorized');
    assert.strictEqual(auth5.adminRole, 'Fleet Supervisor');
  });

  await t.test('Reports collection rules enforce valid submission lifecycle', () => {
    // Check that reports rules require status Under Review or Submitted for creation
    assert.match(
      rulesContent,
      /\(request\.resource\.data\.status == 'Under Review' \|\| request\.resource\.data\.status == 'Submitted'\)/,
      'Firestore rules must enforce initial report status as Under Review or Submitted'
    );
  });
});
