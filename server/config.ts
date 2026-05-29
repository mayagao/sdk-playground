export const PORT = Number(process.env.PORT) || 3456;
export const REPO_CWD = process.cwd();
export const MAX_EXPLAIN_CHARS = 100_000;
export const JSON_BODY_LIMIT = "512kb";
import type { ModelSelection } from "@cursor/sdk";

/** Composer 2.5 with fast mode (see GET /v1/models `parameters` for your account). */
export const DEFAULT_MODEL: ModelSelection = {
  id: "composer-2.5",
  params: [{ id: "fast", value: "true" }],
};
