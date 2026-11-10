// Локальный просмотр сайта: отдаёт папку docs/ на http://localhost:8123 (без сборки и зависимостей).
// Запуск: npm run preview   (остановить: Ctrl+C). Нужен, потому что страница читает data/stats.json через fetch,
// а из file:// браузер это блокирует.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const port = Number(process.env.PORT) || 8123;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml",
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end("not found");
  }
  res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
  res.setHeader("cache-control", "no-store");
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Сайт: http://localhost:${port}  (Ctrl+C — остановить)`));
