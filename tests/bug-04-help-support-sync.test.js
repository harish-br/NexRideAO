import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-04: Help & Support tickets Firestore sync verification', async (t) => {
  const hsJsPath = path.resolve('js/help-support.js');
  assert.ok(fs.existsSync(hsJsPath), 'js/help-support.js must exist');
  
  const hsJsContent = fs.readFileSync(hsJsPath, 'utf8');

  await t.test('help-support.js imports Firebase auth and Firestore', () => {
    assert.match(
      hsJsContent,
      /import\s*\{\s*auth,\s*firestore\s*\}\s*from\s*['"]\.\/firebase-config\.js['"]/,
      'help-support.js must import auth and firestore from firebase-config'
    );
    assert.match(
      hsJsContent,
      /import\s*\{[\s\S]*?doc[\s\S]*?setDoc[\s\S]*?\}\s*from\s*['"]https:\/\/www\.gstatic\.com\/firebasejs\/10\.8\.1\/firebase-firestore\.js['"]/,
      'help-support.js must import doc and setDoc from firestore'
    );
  });

  await t.test('createSupportRequest saves ticket to Firestore reports collection', () => {
    assert.match(
      hsJsContent,
      /await\s+setDoc\(doc\(firestore,\s*['"]reports['"],\s*id\),\s*reportPayload\)/,
      'createSupportRequest must call setDoc on reports collection with ticket ID'
    );
    assert.match(
      hsJsContent,
      /status:\s*['"]Submitted['"]/,
      'Ticket payload status must be Submitted to comply with firestore.rules'
    );
    assert.match(
      hsJsContent,
      /source:\s*['"]Help & Support['"]/,
      'Ticket payload must tag source as Help & Support'
    );
  });

  await t.test('createSupportRequest retains localStorage caching for offline support', () => {
    assert.match(
      hsJsContent,
      /localStorage\.setItem\(STORAGE_KEY,\s*JSON\.stringify\(tickets\)\)/,
      'createSupportRequest must continue to cache tickets in localStorage'
    );
  });
});
