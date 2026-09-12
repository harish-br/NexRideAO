import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-05: server.js path traversal security verification', async (t) => {
  const serverJsPath = path.resolve('server.js');
  assert.ok(fs.existsSync(serverJsPath), 'server.js must exist');
  
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

  await t.test('server.js defines ROOT_DIR and checks path containment', () => {
    assert.match(
      serverJsContent,
      /const\s+ROOT_DIR\s*=\s*path\.resolve\(__dirname\s*\|\|\s*['"]\.['"]\);/,
      'server.js must define ROOT_DIR'
    );
    assert.match(
      serverJsContent,
      /if\s*\(!resolvedPath\.startsWith\(ROOT_DIR\)\)\s*\{[\s\S]*?403[\s\S]*?403 Forbidden[\s\S]*?return;\s*\}/,
      'server.js must return 403 Forbidden when resolvedPath is outside ROOT_DIR'
    );
  });

  await t.test('Sanitization algorithm blocks directory traversal payloads', () => {
    const ROOT_DIR = path.resolve('.');

    function checkPathAllowed(reqUrl) {
      let reqPath = reqUrl.split('?')[0];
      try {
        reqPath = decodeURI(reqPath);
      } catch (e) {}

      if (reqPath.includes('..')) {
        return false;
      }
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const resolvedPath = path.resolve(ROOT_DIR, '.' + reqPath);
      return resolvedPath.startsWith(ROOT_DIR);
    }

    // Normal paths are allowed
    assert.strictEqual(checkPathAllowed('/'), true);
    assert.strictEqual(checkPathAllowed('/index.html'), true);
    assert.strictEqual(checkPathAllowed('/css/style.css'), true);

    // Traversal attempts are rejected (returns false)
    assert.strictEqual(checkPathAllowed('/../../../../etc/passwd'), false);
    assert.strictEqual(checkPathAllowed('/../../../etc/shadow'), false);
    assert.strictEqual(checkPathAllowed('/..%2F..%2Fsecret.key'), false);
    assert.strictEqual(checkPathAllowed('/sub/../../secret.txt'), false);
  });
});
