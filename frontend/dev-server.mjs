import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}`).pathname);
    const target = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(root + sep)) throw new Error("invalid path");
    if (!(await stat(target)).isFile()) throw new Error("not a file");
    response.setHeader("Content-Type", contentTypes[extname(target).toLowerCase()] || "application/octet-stream");
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("页面不存在");
  }
}).listen(port, host, () => {
  console.log(`FRROCO CRM 前端：http://${host}:${port}`);
});
