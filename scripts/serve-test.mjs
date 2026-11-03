// A static test server, not the production server. No SPA fallback hides missing assets.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
try { await stat(resolve(root, 'index.html')); }
catch { console.error('dist/index.html이 없습니다. npm run build를 먼저 실행하세요.'); process.exit(1); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/tools/formatter') { res.writeHead(308, { Location: '/tools/formatter/' }); res.end(); return; }
    if (path.startsWith('/tools/formatter/')) path = path.slice('/tools/formatter'.length);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(4173, '127.0.0.1', () => console.log('Static test server: http://127.0.0.1:4173'));
