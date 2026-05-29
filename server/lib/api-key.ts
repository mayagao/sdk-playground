import { CursorAgentError } from "@cursor/sdk";

export function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    throw new CursorAgentError("CURSOR_API_KEY is not set");
  }
  return key;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}
