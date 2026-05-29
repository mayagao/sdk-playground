export function planPrompt(code: string): string {
  return `You are analyzing pasted source code for a designer who is learning programming.

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
  return `You are writing explanations for a designer who is actively learning to code.

RULES:
- Do NOT edit any files.
- Respond with ONLY valid JSON. No markdown fences, no commentary.
- Audience: a designer who knows visual / UX work but is new to programming. Plain language plus small amounts of programming vocabulary they can search and reuse.
- Each section.summary must be markdown. The first sentence MUST be wrapped in **double asterisks** (bold lead sentence). Use 2-4 short paragraphs, not bullets.
- Any technical term used in summaries must have a matching entry in concepts[].
- conceptRefs on each section lists concept ids referenced in that section's summary.

CONCEPTS (very important):
- Pick 4-8 concepts the reader should learn — prefer programming-flavored ones they can google: "async/await", "Server-Sent Events", "Express middleware", "route handler", "type guard", "destructuring", "environment variables", "ESM module", "generator function", "Promise", "closure", "stream", "JSON parsing", "RegExp", "spread syntax", etc.
- AVOID overly basic universal terms ("API", "function", "variable", "object") unless they truly haven't appeared anywhere on the page.
- Each concept entry MUST include:
  - id: short kebab-case
  - term: human-readable name
  - definition: 1-2 sentence plain explanation
  - example: a SHORT (1-3 line) minimal code snippet in the same language as the snippet (or closest fit) that shows the concept in actual use. NO comments, NO markdown fences, just the code.

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
      "conceptRefs": ["async-await"]
    }
  ],
  "concepts": [
    {
      "id": "async-await",
      "term": "async/await",
      "definition": "Lets you write asynchronous code that reads top-to-bottom; await pauses inside an async function until a Promise settles.",
      "example": "async function main() {\\n  const data = await fetch('/api')\\n}"
    }
  ]
}

STRUCTURAL PLAN:
${planJson}

ORIGINAL PASTED CODE:
\`\`\`
${code}
\`\`\``;
}

export function followUpPrompt(args: {
  question: string;
  sectionTitle?: string;
  sectionCode?: string;
  startLine?: number;
  endLine?: number;
}): string {
  const { question, sectionTitle, sectionCode, startLine, endLine } = args;
  const lineRange =
    startLine != null && endLine != null ? ` (lines ${startLine}–${endLine})` : "";

  const codeBlock = sectionCode
    ? `\n\nThe section in question:\n\`\`\`\n${sectionCode}\n\`\`\``
    : "";

  return `Follow-up question for a designer-learner about the section "${sectionTitle ?? "(unspecified)"}"${lineRange}.

You have the full pasted code and prior explanation in this conversation already.

REPLY RULES:
- Markdown only. No JSON. No file edits.
- Bold the lead sentence with **double asterisks**.
- Keep it under 120 words.
- A 1-3 line code example is welcome when it clarifies the answer.

QUESTION: ${question}${codeBlock}`;
}
