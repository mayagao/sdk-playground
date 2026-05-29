import { Router } from "express";
import { hasApiKey } from "../lib/api-key.js";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ ok: true, hasApiKey: hasApiKey() });
  });

  return router;
}
