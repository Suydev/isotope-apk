#!/usr/bin/env node
/**
 * www-server.mjs — static server for the compiled APK site with SPA fallback.
 *
 * The compiled site is an SPA (React Router). Any path that does not map to a
 * real file in www/ falls back to index.html so client-side routes like /auth,
 * /dashboard, /onboarding work when the site is opened directly.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WWW = fileURLToPath(new URL('../www/', import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3':  'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.wasm': 'application/wasm',
  '.txt':  'text/plain; charset=utf-8',
};

function typeFor(path) {
  const e = extname(path).toLowerCase();
  return MIME[e] || 'application/octet-stream';
}

async function tryFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) return true;
  } catch { /* not found */ }
  return false;
}

const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }

  // Resolve inside WWW only (no traversal).
  const requested = normalize(join(WWW, urlPath));
  if (!requested.startsWith(WWW)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  // Serve the file if it exists.
  if (await tryFile(requested)) {
    try {
      const buf = await readFile(requested);
      res.writeHead(200, {
        'Content-Type': typeFor(requested),
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(buf);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Read error: ' + e.message);
    }
  }

  // SPA fallback → index.html for non-asset, non-API routes.
  const isAsset = /\.\w+$/.test(urlPath);
  const isApi = urlPath.startsWith('/api/') || urlPath.startsWith('/__');
  if (!isAsset && !isApi) {
    try {
      const buf = await readFile(join(WWW, 'index.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      return res.end(buf);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('index.html missing: ' + e.message);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found: ' + urlPath);
});

server.listen(PORT, HOST, () => {
  console.log(`[www-server] http://${HOST}:${PORT}  →  ${WWW}`);
});
