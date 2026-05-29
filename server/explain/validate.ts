export function isPlanShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.language === "string" && Array.isArray(v.sections);
}

export function isExplainShape(value: unknown): value is Record<string, unknown> {
  if (!isPlanShape(value)) return false;
  const sections = (value as Record<string, unknown>).sections as unknown[];
  return sections.every(
    (s) =>
      s &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).summary === "string",
  );
}
