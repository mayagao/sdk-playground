export function planPrompt(code: string): string {
  return `You are analyzing pasted source code for a designer who is not a professional developer.

RULES:
- Do NOT edit, create, or delete any files. Analysis only.
- Respond with ONLY valid JSON. No markdown fences, no commentary before or after.

TASK:
1. Detect the programming language (use "plaintext" if unclear).
2. Produce formattedCode: the same code with consistent indentation and spacing.
3. Split the code into logical sections. Each section needs:
   - id: short kebab-case slug
   - title: plain English (no jargon)
   - startLine, endLine: 1-based line numbers in the original paste
   - code: exact lines for that section (from the paste)
   - importance: "essential" (core behavior), "supporting" (helps but skippable), or "noise" (boilerplate, imports-only, repetitive examples, license headers)

Mark imports, type-only blocks, duplicate curl/JSON examples, and long parameter lists as "noise" when possible.

JSON shape:
{
  "language": "typescript",
  "languageLabel": "TypeScript",
  "formattedCode": "...",
  "sections": [
    {
      "id": "example",
      "title": "Example section",
      "startLine": 1,
      "endLine": 10,
      "code": "...",
      "importance": "essential"
    }
  ]
}

PASTED CODE:
\`\`\`
${code}
\`\`\``;
}

export function explainPrompt(planJson: string, code: string): string {
  return `You are writing designer-friendly explanations for pasted code sections.

RULES:
- Do NOT edit any files.
- Respond with ONLY valid JSON. No markdown fences, no commentary.
- Audience: a designer, not a professional developer. Use simple language and short analogies.
- Each section.summary must be markdown. The first sentence MUST be wrapped in **double asterisks** (bold lead sentence).
- Any technical term used in summaries must have a matching entry in concepts[].
- conceptRefs on each section lists concept ids referenced in that section's summary.

Use the structural plan below. Keep section ids, titles, line ranges, code, and importance from the plan. Add summary and conceptRefs.

JSON shape:
{
  "language": "...",
  "languageLabel": "...",
  "formattedCode": "...",
  "sections": [
    {
      "id": "...",
      "title": "...",
      "startLine": 1,
      "endLine": 10,
      "code": "...",
      "importance": "essential",
      "summary": "**This part does X.** Plain explanation...",
      "conceptRefs": ["api"]
    }
  ],
  "concepts": [
    { "id": "api", "term": "API", "definition": "A way for apps to talk to each other..." }
  ]
}

STRUCTURAL PLAN:
${planJson}

ORIGINAL PASTED CODE:
\`\`\`
${code}
\`\`\``;
}
