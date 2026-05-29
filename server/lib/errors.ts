import type { Response } from "express";
import { CursorAgentError } from "@cursor/sdk";
import { writeSse } from "./sse.js";

export function sendJsonAgentError(res: Response, err: unknown): boolean {
  if (err instanceof CursorAgentError) {
    const status = err.message.includes("CURSOR_API_KEY") ? 503 : 500;
    res.status(status).json({ error: err.message, retryable: err.isRetryable });
    return true;
  }
  return false;
}

export function sendJsonServerError(res: Response, err: unknown): void {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
}

/** Use when headers may already be sent (SSE routes). */
export function sendSseAgentError(res: Response, err: unknown): void {
  if (err instanceof CursorAgentError) {
    writeSse(res, { type: "error", message: err.message });
  } else {
    console.error(err);
    writeSse(res, { type: "error", message: "Unexpected server error" });
  }
  res.end();
}
