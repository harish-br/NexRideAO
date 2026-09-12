import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-03: Bus ID synchronization between Admin and Live Tracking verification', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  const liveTrackingJsPath = path.resolve('js/live-tracking.js');

  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(liveTrackingJsPath), 'js/live-tracking.js must exist');
  
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  const liveTrackingContent = fs.readFileSync(liveTrackingJsPath, 'utf8');

  await t.test('admin.js saves new buses using deterministic bus_${busNo} doc ID', () => {
    // Check that addDoc(collection(firestore, 'buses') is NOT used for new bus creation
    assert.doesNotMatch(
      adminJsContent,
      /addDoc\(collection\(firestore,\s*['"]buses['"]\)/,
      'admin.js must not use addDoc for buses which generates random IDs'
    );

    // Check that setDoc with bus_${busNo} is used
    assert.match(
      adminJsContent,
      /finalBusId\s*=\s*busEditId\s*\|\|\s*`bus_\$\{busNo\}`/,
      'admin.js must set finalBusId using deterministic template `bus_${busNo}`'
    );
    assert.match(
      adminJsContent,
      /await setDoc\(doc\(firestore,\s*['"]buses['"],\s*finalBusId\),\s*payload,\s*\{\s*merge:\s*true\s*\}\)/,
      'admin.js must use setDoc with finalBusId and merge: true'
    );
  });

  await t.test('live-tracking.js consumes buses with bus_${busNum} doc ID', () => {
    assert.match(
      liveTrackingContent,
      /startBusTracking\(`bus_\$\{busNum\}`, busNum\)/,
      'live-tracking.js must listen to bus_${busNum}'
    );
    assert.match(
      liveTrackingContent,
      /doc\(firestore,\s*['"]buses['"],\s*`bus_\$\{busStr\}`\)/,
      'live-tracking.js must check doc buses/bus_${busStr}'
    );
  });
});
