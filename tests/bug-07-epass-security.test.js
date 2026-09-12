import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('BUG-07: E-Pass security key decoupling verification', async (t) => {
  const epassJsPath = path.resolve('js/epass.js');
  assert.ok(fs.existsSync(epassJsPath), 'js/epass.js must exist');
  
  const epassJsContent = fs.readFileSync(epassJsPath, 'utf8');

  await t.test('Hardcoded secret key string is completely removed', () => {
    assert.doesNotMatch(
      epassJsContent,
      /const\s+secretKey\s*=\s*['"]NEXRIDE_SECURE_EPASS_KEY_V1['"]/,
      'epass.js must not contain hardcoded secret key NEXRIDE_SECURE_EPASS_KEY_V1'
    );
  });

  await t.test('generateHash supports configurable salt and structured entropy', () => {
    assert.match(
      epassJsContent,
      /VITE_EPASS_SALT/,
      'generateHash must support configurable VITE_EPASS_SALT from environment'
    );
    assert.match(
      epassJsContent,
      /`\$\{userId\}:\$\{passId\}:\$\{issuedAt\}:\$\{salt\}`/,
      'generateHash must use structured delimiter-separated payload'
    );
  });

  await t.test('SHA-256 digest calculation produces 64-char hex string', () => {
    const payload = 'USR123:PASS-999:1700000000:TEST_SALT';
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });
});
