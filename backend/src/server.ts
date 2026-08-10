import "dotenv/config";

import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1 到 65535 之间的整数");

const server = app.listen(port, () => console.log(`法洛可 CRM API 已启动：http://localhost:${port}`));
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${signal}，正在关闭服务...`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(async (error) => {
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(error ? 1 : 0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
