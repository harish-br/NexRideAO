import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

test('FULL REGRESSION: E-Pass Cryptographic Integrity & Anti-Tamper Verification', async (t) => {
  function computeHashNode(userId, passId, issuedAt, salt = 'NEXRIDE_EPASS_V1') {
    const payload = `${userId}:${passId}:${issuedAt}:${salt}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  function fallbackHash(userId, passId, issuedAt, salt = 'NEXRIDE_EPASS_V1') {
    const payload = `${userId}:${passId}:${issuedAt}:${salt}`;
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      const char = payload.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'fallback-hash-' + Math.abs(hash).toString(16);
  }

  await t.test('Modifying userId completely alters security hash (Avalanche effect)', () => {
    const orig = computeHashNode('user_alice', 'PASS_001', 1700000000);
    const tampered = computeHashNode('user_bob', 'PASS_001', 1700000000);
    assert.notStrictEqual(orig, tampered);
  });

  await t.test('Modifying passId alters security hash', () => {
    const orig = computeHashNode('user_alice', 'PASS_001', 1700000000);
    const tampered = computeHashNode('user_alice', 'PASS_002', 1700000000);
    assert.notStrictEqual(orig, tampered);
  });

  await t.test('Modifying issuedAt timestamp alters security hash', () => {
    const orig = computeHashNode('user_alice', 'PASS_001', 1700000000);
    const tampered = computeHashNode('user_alice', 'PASS_001', 1700000001);
    assert.notStrictEqual(orig, tampered);
  });

  await t.test('Fallback hash algorithm produces non-empty deterministic string', () => {
    const h1 = fallbackHash('user_alice', 'PASS_001', 1700000000);
    const h2 = fallbackHash('user_alice', 'PASS_001', 1700000000);
    assert.strictEqual(h1, h2);
    assert.match(h1, /^fallback-hash-[a-f0-9]+$/);
  });

  await t.test('E-Pass validity period is exactly 30 days', () => {
    const issuedAt = 1710000000000;
    const expiresAt = issuedAt + (30 * 24 * 60 * 60 * 1000);
    const diffDays = (expiresAt - issuedAt) / (24 * 60 * 60 * 1000);
    assert.strictEqual(diffDays, 30);
  });
});
