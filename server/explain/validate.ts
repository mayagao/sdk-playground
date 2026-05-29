export function isPlanShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.language === "string" && Array.isArray(v.sections) && v.sections.length > 0;
}

/** Coerce common agent JSON drift before validation. */
export function normalizePlanShape(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const language =
    typeof raw.language === "string"
      ? raw.language
      : typeof raw.programmingLanguage === "string"
        ? raw.programmingLanguage
        : typeof raw.lang === "string"
          ? raw.lang
          : "plaintext";

  const sections = raw.sections ?? raw.parts;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const languageLabel =
    typeof raw.languageLabel === "string"
      ? raw.languageLabel
      : language === "plaintext"
        ? "Plain text"
        : language.charAt(0).toUpperCase() + language.slice(1);

  const formattedCode =
    typeof raw.formattedCode === "string"
      ? raw.formattedCode
      : typeof raw.code === "string"
        ? raw.code
        : "";

  return {
    ...raw,
    language,
    languageLabel,
    formattedCode,
    sections,
  };
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
