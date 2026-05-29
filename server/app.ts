import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { JSON_BODY_LIMIT } from "./config.js";
import { createAskRouter } from "./routes/ask.js";
import { createExplainRouter } from "./routes/explain.js";
import { createHealthRouter } from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createApp(): express.Application {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(publicDir));

  app.use("/api/health", createHealthRouter());
  app.use("/api/ask", createAskRouter());
  app.use("/api/explain", createExplainRouter());

  return app;
}
