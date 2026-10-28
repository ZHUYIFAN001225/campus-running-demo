import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const port=Number(process.env.PORT||4173);
const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    pathname = pathname.replace(/^\/campus-running-demo(?=\/|$)/, '');
    const file = resolve(root, `.${pathname || '/'}`, pathname.endsWith('/') || !pathname ? 'index.html' : '');
    if (!file.startsWith(root + sep) || file.includes(`${sep}.git${sep}`) || !(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Campus demo: http://127.0.0.1:${port}/campus-running-demo/`));
