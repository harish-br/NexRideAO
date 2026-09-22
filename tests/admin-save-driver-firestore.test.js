import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('FIRESTORE PERSISTENCE: Driver Details & Fleet Synchronization', async (t) => {
  const htmlPath = path.resolve('admin/index.html');
  const jsPath = path.resolve('admin/admin.js');
  const rulesPath = path.resolve('firestore.rules');

  assert.ok(fs.existsSync(htmlPath), 'admin/index.html must exist');
  assert.ok(fs.existsSync(jsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  await t.test('1. Firestore Security Rules configure /drivers collection access', () => {
    assert.match(
      rules,
      /match\s+\/drivers\/\{document=\*\*\}/,
      'firestore.rules must contain match /drivers/{document=**}'
    );
    assert.match(
      rules,
      /match\s+\/drivers\/\{document=\*\*\}\s*\{\s*allow\s+read:\s*if\s*true;/,
      'firestore.rules must allow read for drivers collection'
    );
    assert.match(
      rules,
      /allow\s+write:\s*if\s*isAuthenticated\(\);/,
      'firestore.rules must require authentication for write operations'
    );
  });

  await t.test('2. saveDriverRecord sanitizes all fields and saves to Firestore drivers collection using setDoc with merge', () => {
    // Verifies setDoc with merge is used
    assert.match(
      js,
      /await\s+setDoc\(doc\(firestore,\s*'drivers',\s*targetDocId\),\s*cleanDriverData,\s*\{\s*merge:\s*true\s*\}\)/,
      'saveDriverRecord must save driver data using setDoc with merge: true'
    );

    // Verifies comprehensive cleanDriverData schema
    assert.match(js, /cleanDriverData\s*=\s*\{/, 'saveDriverRecord must construct cleanDriverData object');
    assert.match(js, /name:\s*name\s*\|\|\s*''/, 'Must sanitize name');
    assert.match(js, /driverId:\s*driverId\s*\|\|\s*''/, 'Must sanitize driverId');
    assert.match(js, /phone:\s*phone\s*\|\|\s*''/, 'Must sanitize phone');
    assert.match(js, /email:\s*email\s*\|\|\s*''/, 'Must sanitize email');
    assert.match(js, /licenseNumber:\s*licenseNumber\s*\|\|\s*''/, 'Must sanitize licenseNumber');
    assert.match(js, /licenseExpiry:\s*licenseExpiry\s*\|\|\s*''/, 'Must sanitize licenseExpiry');
    assert.match(js, /assignedBusId:\s*assignedBusId\s*\|\|\s*''/, 'Must sanitize assignedBusId');
    assert.match(js, /verificationStatus:\s*verificationStatus\s*\|\|\s*'Verified'/, 'Must sanitize verificationStatus');
  });

  await t.test('3. Bus synchronization in Firestore is executed on driver save', () => {
    // Bus update in Firestore
    assert.match(
      js,
      /await\s+updateDoc\(doc\(firestore,\s*'buses',\s*assignedBusObj\.id\),\s*\{[\s\S]*?driverName:\s*name,[\s\S]*?driverContact:\s*phone,[\s\S]*?driverLicense:\s*licenseNumber/,
      'Must sync driver details to assigned bus document in Firestore'
    );
  });

  await t.test('4. handleDeleteDriverDirect deletes directly from Firestore drivers collection', () => {
    assert.match(
      js,
      /await\s+deleteDoc\(doc\(firestore,\s*'drivers',\s*driverId\)\)/,
      'handleDeleteDriverDirect must call deleteDoc on firestore drivers collection'
    );
    assert.match(
      js,
      /logAuditEvent\('DRIVER_DELETED',\s*'drivers'/,
      'Must record DRIVER_DELETED audit log'
    );
  });

  await t.test('5. Fleet bus drivers are auto-synced to Firestore drivers collection', () => {
    assert.match(
      js,
      /async function syncMissingDriversToFirestore\(\)/,
      'admin.js must define syncMissingDriversToFirestore'
    );
    assert.match(
      js,
      /await\s+setDoc\(doc\(firestore,\s*'drivers',\s*docId\),\s*driverRecord,\s*\{\s*merge:\s*true\s*\}\)/,
      'syncMissingDriversToFirestore must persist driver records with setDoc'
    );
    assert.match(
      js,
      /listenToDrivers\(\)[\s\S]*?syncMissingDriversToFirestore\(\)/,
      'listenToDrivers must invoke syncMissingDriversToFirestore'
    );
  });

  await t.test('6. Driver Details modal includes Delete Driver button wired to handleDeleteDriverDirect', () => {
    assert.match(
      html,
      /id="driver-details-delete-btn"/,
      'admin/index.html must include #driver-details-delete-btn'
    );
    assert.match(
      js,
      /document\.getElementById\('driver-details-delete-btn'\)\?\.addEventListener\('click'/,
      'admin.js must wire click listener on #driver-details-delete-btn'
    );
  });

  await t.test('7. Quick assign and bus edit synchronize driver assignment to Firestore drivers collection', () => {
    assert.match(
      js,
      /await\s+setDoc\(doc\(firestore,\s*'drivers',\s*matchedDriver\.id\),\s*\{[\s\S]*?assignedBusId:\s*finalBusId/,
      'Bus save must sync assignedBusId to driver in Firestore'
    );
    assert.match(
      js,
      /await\s+setDoc\(doc\(firestore,\s*'drivers',\s*driver\.id\),\s*\{[\s\S]*?assignedBusId:\s*targetBus\.id/,
      'Quick driver assign must sync assignedBusId to driver in Firestore'
    );
  });
});
