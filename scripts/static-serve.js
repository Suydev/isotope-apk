// Minimal static file server for previewing the prebuilt www/ bundle.
// Used only for local UI inspection/debugging, not part of the app build.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "www");
const PORT = process.env.PORT || 5000;

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".wasm": "application/wasm",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        // SPA fallback
        return fs.readFile(path.join(ROOT, "index.html"), (err3, html) => {
          if (err3) { res.writeHead(404); return res.end("Not found"); }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        });
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}).listen(PORT, "0.0.0.0", () => console.log(`Static preview server on :${PORT}`));
