export const PORT = Number(process.env.PORT) || 3456;
export const REPO_CWD = process.cwd();
export const MAX_EXPLAIN_CHARS = 100_000;
export const JSON_BODY_LIMIT = "512kb";
export const DEFAULT_MODEL = { id: "composer-2.5" } as const;
