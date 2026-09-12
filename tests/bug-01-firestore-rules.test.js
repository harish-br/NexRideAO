import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-01: firestore.rules security verification', async (t) => {
  const rulesPath = path.resolve('firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  await t.test('isAdmin() must NOT grant admin access to anonymous users', () => {
    // Extract isAdmin function
    const isAdminMatch = rulesContent.match(/function isAdmin\(\)\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(isAdminMatch, 'isAdmin() function should be defined');
    
    const isAdminBody = isAdminMatch[1];
    assert.doesNotMatch(
      isAdminBody,
      /sign_in_provider\s*==\s*['"]anonymous['"]/,
      'isAdmin() must not grant admin privileges to anonymous sessions'
    );
    assert.doesNotMatch(
      isAdminBody,
      /token\.firebase/,
      'isAdmin() must not inspect token.firebase for anonymous provider bypass'
    );
  });

  await t.test('isAdmin() preserves legitimate admin access controls', () => {
    const isAdminMatch = rulesContent.match(/function isAdmin\(\)\s*\{([\s\S]*?)\n\s*\}/);
    const isAdminBody = isAdminMatch[1];

    assert.match(
      isAdminBody,
      /software_admin/,
      'isAdmin() should check software_admin collection'
    );
    assert.match(
      isAdminBody,
      /request\.auth\.token\.admin\s*==\s*true/,
      'isAdmin() should check custom claim admin == true'
    );
    assert.match(
      isAdminBody,
      /request\.auth\.token\.role\s*==\s*['"]admin['"]/,
      'isAdmin() should check custom claim role == "admin"'
    );
  });

  await t.test('Live buses and stops data remain writable by authenticated/telematics clients', () => {
    assert.match(
      rulesContent,
      /match \/buses\/\{document=\*\*\}\s*\{[\s\S]*?allow read:\s*if true;\s*allow write:\s*if isAuthenticated\(\);/,
      'buses collection must allow read for all and write for isAuthenticated'
    );
    assert.match(
      rulesContent,
      /match \/stops\/\{document=\*\*\}\s*\{[\s\S]*?allow read:\s*if true;\s*allow write:\s*if isAuthenticated\(\);/,
      'stops collection must allow read for all and write for isAuthenticated'
    );
  });

  await t.test('firestore.rules has balanced braces', () => {
    let openBraces = 0;
    for (const char of rulesContent) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
    }
    assert.strictEqual(openBraces, 0, 'firestore.rules must have matching curly braces');
  });
});
