import cors from "cors";
import express from "express";

import { errorHandler } from "./lib/http.js";
import { prisma } from "./lib/prisma.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
const allowedOrigins = new Set([
  "https://frroco-crm.me",
  "https://www.frroco-crm.me",
  "https://api.frroco-crm.me",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/ready", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ status: "ready" });
});
app.use("/api/v1", apiRouter);
app.use((_request, response) => response.status(404).json({ error: { code: "NOT_FOUND", message: "接口不存在" } }));
app.use(errorHandler);

export default app;
