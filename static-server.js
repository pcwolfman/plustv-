/**
 * Minimal static file server for PlusTV (no external deps).
 *
 * Usage:
 *   node static-server.js
 *   PORT=8080 node static-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.m3u': 'application/vnd.apple.mpegurl; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl; charset=utf-8',
  '.ts': 'video/mp2t'
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(root, normalized);
}

const server = http.createServer((req, res) => {
  try {
    const parsed = url.parse(req.url);
    const pathname = parsed.pathname || '/';

    // Serve index for root
    let filePath = pathname === '/' ? path.join(ROOT, 'index.html') : safeJoin(ROOT, pathname);

    // If path is a directory, serve its index.html
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch (_) {
      // ignore
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA-ish fallback: if not found and request expects HTML, serve index.html
        const accept = String(req.headers.accept || '');
        if (err.code === 'ENOENT' && accept.includes('text/html')) {
          const indexPath = path.join(ROOT, 'index.html');
          return fs.readFile(indexPath, (idxErr, idxData) => {
            if (idxErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              return res.end('Not found');
            }
            res.writeHead(200, {
              'Content-Type': MIME['.html'],
              'Cache-Control': 'no-store',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end(idxData);
          });
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('Not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(data);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`✅ PlusTV static server running: http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`📁 Serving from: ${ROOT}`);
});

