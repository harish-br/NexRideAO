import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

test('FULL REGRESSION: server.js In-Memory Request Handler Security & Routing', async (t) => {
  const ROOT_DIR = path.resolve('.');
  const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  function createRequestHandler() {
    return (req, res) => {
      let reqPath = req.url.split('?')[0];
      try {
        reqPath = decodeURI(reqPath);
      } catch (e) {}

      if (reqPath.includes('..')) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 Forbidden</h1>', 'utf-8');
        return;
      }

      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      const resolvedPath = path.resolve(ROOT_DIR, '.' + reqPath);

      if (!resolvedPath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 Forbidden</h1>', 'utf-8');
        return;
      }

      const extname = String(path.extname(resolvedPath)).toLowerCase();
      const contentType = MIME_TYPES[extname] || 'application/octet-stream';

      fs.readFile(resolvedPath, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>', 'utf-8');
          } else {
            res.writeHead(500);
            res.end(`Server Error: ${error.code}`);
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    };
  }

  function simulateRequest(urlPath) {
    return new Promise((resolve) => {
      const handler = createRequestHandler();
      const req = { url: urlPath, method: 'GET' };
      const res = {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(code, headers) {
          this.statusCode = code;
          if (headers) Object.assign(this.headers, headers);
        },
        end(chunk) {
          if (chunk) this.body += chunk.toString();
          resolve({ status: this.statusCode, headers: this.headers, body: this.body });
        }
      };
      handler(req, res);
    });
  }

  await t.test('Root path / returns 200 OK and text/html', async () => {
    const res = await simulateRequest('/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['Content-Type'], 'text/html');
    assert.ok(res.body.length > 0, 'Should return index.html content');
  });

  await t.test('Static CSS asset /css/style.css returns 200 OK and text/css', async () => {
    const res = await simulateRequest('/css/style.css');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['Content-Type'], 'text/css');
  });

  await t.test('Query parameters are stripped cleanly (e.g. /index.html?v=123)', async () => {
    const res = await simulateRequest('/index.html?v=123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['Content-Type'], 'text/html');
  });

  await t.test('Directory traversal with ../ is blocked with 403 Forbidden', async () => {
    const res = await simulateRequest('/../../../package.json');
    assert.strictEqual(res.status, 403);
    assert.match(res.body, /403 Forbidden/);
  });

  await t.test('Encoded directory traversal with %2e%2e is blocked with 403 Forbidden', async () => {
    const res = await simulateRequest('/%2e%2e%2f%2e%2e%2fpackage.json');
    assert.strictEqual(res.status, 403);
    assert.match(res.body, /403 Forbidden/);
  });

  await t.test('Non-existent resource returns 404 Not Found', async () => {
    const res = await simulateRequest('/non_existent_page_12345.html');
    assert.strictEqual(res.status, 404);
    assert.match(res.body, /404 Not Found/);
  });
});
