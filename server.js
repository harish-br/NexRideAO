const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 0;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const ROOT_DIR = path.resolve(__dirname || '.');

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Basic routing & path sanitization to prevent directory traversal
  let reqPath = req.url.split('?')[0];
  try {
    reqPath = decodeURI(reqPath);
  } catch (e) {
    // Keep raw reqPath if malformed
  }

  // Reject directory traversal attempts immediately
  if (reqPath.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 Forbidden</h1>', 'utf-8');
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const resolvedPath = path.resolve(ROOT_DIR, '.' + reqPath);

  // Strictly enforce that the resolved path is within ROOT_DIR
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
});

// Bind to 0.0.0.0 to allow access from local network
server.listen(PORT, '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log(`\nServer running!`);
  console.log(`- Local: http://localhost:${actualPort}`);
  
  // Get local network IP
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`- Network: http://${iface.address}:${actualPort}`);
      }
    }
  }
  console.log(`\nYou can now visit the Network URL on your phone to test the layout.\n`);
});
