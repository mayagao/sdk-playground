import type { Response } from "express";

export function writeSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function initSse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function wantsEventStream(acceptHeader: string | undefined): boolean {
  return acceptHeader?.includes("text/event-stream") ?? false;
}
