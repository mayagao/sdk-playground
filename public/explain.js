import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

const form = document.getElementById("explain-form");
const codeInput = document.getElementById("code-input");
const explainBtn = document.getElementById("explain-btn");
const statusEl = document.getElementById("status");
const detectedLangEl = document.getElementById("detected-lang");
const progressSteps = document.getElementById("progress-steps");
const behindScenes = document.getElementById("behind-scenes");
const behindContent = document.getElementById("behind-content");
const resultsEl = document.getElementById("results");
const resultLangEl = document.getElementById("result-lang");
const fullCodeBlock = document.getElementById("full-code-block");
const sectionsEl = document.getElementById("sections");
const conceptsPanel = document.getElementById("concepts-panel");
const conceptsList = document.getElementById("concepts-list");

marked.setOptions({ gfm: true, breaks: true });

let detectTimer = null;
let activeUtterance = null;
let speakingButton = null;
let voicesReady = false;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseMarkdown(raw) {
  if (!raw?.trim()) return "";
  return DOMPurify.sanitize(marked.parse(raw, { async: false }));
}

function markdownToPlainText(raw) {
  const html = parseMarkdown(raw);
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function setProgress(step) {
  for (const li of progressSteps.querySelectorAll(".progress-step")) {
    const key = li.dataset.step;
    li.classList.remove("active", "done");
    if (step === "idle") continue;
    if (key === "detect" && (step === "detect" || step === "plan" || step === "explain" || step === "done")) {
      li.classList.add(step === "detect" ? "active" : "done");
    }
    if (key === "plan" && (step === "plan" || step === "explain" || step === "done")) {
      li.classList.add(step === "plan" ? "active" : "done");
    }
    if (key === "explain" && (step === "explain" || step === "done")) {
      li.classList.add(step === "explain" ? "active" : "done");
    }
  }
}

function detectLanguagePreview() {
  const code = codeInput.value.trim();
  if (!code) {
    detectedLangEl.hidden = true;
    return;
  }
  const result = hljs.highlightAuto(code, [
    "typescript",
    "javascript",
    "python",
    "json",
    "bash",
    "shell",
    "css",
    "html",
    "xml",
    "yaml",
    "markdown",
    "java",
    "go",
    "rust",
    "sql",
  ]);
  const label = result.language
    ? result.language.charAt(0).toUpperCase() + result.language.slice(1)
    : "Plain text";
  detectedLangEl.textContent = `Looks like ${label}`;
  detectedLangEl.hidden = false;
  detectedLangEl.classList.remove("lang-pill-muted");
}

codeInput.addEventListener("input", () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(detectLanguagePreview, 200);
});

function ensureVoices() {
  if (voicesReady || !window.speechSynthesis) return;
  speechSynthesis.getVoices();
  voicesReady = true;
}

function stopSpeaking() {
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
  activeUtterance = null;
  if (speakingButton) {
    speakingButton.classList.remove("speaking");
    speakingButton.setAttribute("aria-label", speakingButton.dataset.labelListen ?? "Listen");
    speakingButton = null;
  }
}

function speakPlainText(text, button) {
  if (!window.speechSynthesis) {
    setStatus("Speech is not supported in this browser", true);
    return;
  }
  ensureVoices();
  if (!text.trim()) return;

  if (speakingButton === button) {
    stopSpeaking();
    return;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.startsWith("en") && v.localService)
    ?? voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;

  utterance.onend = () => stopSpeaking();
  utterance.onerror = () => stopSpeaking();

  activeUtterance = utterance;
  speakingButton = button;
  button.classList.add("speaking");
  button.setAttribute("aria-label", "Stop speaking");
  speechSynthesis.speak(utterance);
}

function createSpeakButton(labelListen, getText) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-speak";
  btn.dataset.labelListen = labelListen;
  btn.setAttribute("aria-label", labelListen);
  btn.innerHTML = `<span class="btn-speak-icon" aria-hidden="true">🔊</span>`;
  btn.addEventListener("click", () => speakPlainText(getText(), btn));
  return btn;
}

function highlightCode(code, language) {
  if (!code) return "";
  try {
    if (language && language !== "plaintext" && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
  } catch {
    /* fall through */
  }
  return hljs.highlightAuto(code).value;
}

function resetResults() {
  stopSpeaking();
  resultsEl.hidden = true;
  resultsEl.classList.add("empty");
  sectionsEl.innerHTML = "";
  conceptsPanel.hidden = true;
  conceptsList.innerHTML = "";
  behindContent.innerHTML = "";
  behindScenes.hidden = true;
  setProgress("idle");
}

function appendBehind(text, kind) {
  behindScenes.hidden = false;
  const el = document.createElement("p");
  el.className = `behind-${kind}`;
  el.textContent = text;
  behindContent.append(el);
}

function renderExplainResult(data) {
  const language = data.language ?? "plaintext";
  const languageLabel = data.languageLabel ?? language;
  const formattedCode = data.formattedCode ?? "";
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const concepts = Array.isArray(data.concepts) ? data.concepts : [];

  resultLangEl.textContent = languageLabel;
  fullCodeBlock.innerHTML = highlightCode(formattedCode, language);
  fullCodeBlock.className = `hljs language-${language}`;

  sectionsEl.innerHTML = "";

  for (const section of sections) {
    const importance = section.importance ?? "supporting";
    const card = document.createElement("article");
    card.className = `explain-card importance-${importance}`;

    const header = document.createElement("header");
    header.className = "explain-card-header";

    const title = document.createElement("h3");
    title.className = "explain-card-title";
    title.textContent = section.title ?? section.id ?? "Section";

    const lineRange = document.createElement("span");
    lineRange.className = "explain-line-range";
    if (section.startLine != null && section.endLine != null) {
      lineRange.textContent = `Lines ${section.startLine}–${section.endLine}`;
    }

    const speakSummary = createSpeakButton("Listen to explanation", () =>
      markdownToPlainText(section.summary ?? ""),
    );

    header.append(title, lineRange, speakSummary);

    const summary = document.createElement("div");
    summary.className = "explain-summary timeline-markdown";
    summary.innerHTML = parseMarkdown(section.summary ?? "");

    card.append(header, summary);

    if (section.code?.trim()) {
      const codeDetails = document.createElement("details");
      codeDetails.className = "explain-code-details";
      if (importance !== "essential") {
        codeDetails.open = false;
      } else {
        codeDetails.open = true;
      }

      const codeSummary = document.createElement("summary");
      const label =
        importance === "noise"
          ? "Boilerplate code (optional)"
          : importance === "supporting"
            ? "Supporting code"
            : "Code for this section";
      codeSummary.textContent = label;

      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      codeEl.className = `hljs language-${language}`;
      codeEl.innerHTML = highlightCode(section.code, language);
      pre.append(codeEl);
      codeDetails.append(codeSummary, pre);
      card.append(codeDetails);
    }

    sectionsEl.append(card);
  }

  if (concepts.length > 0) {
    conceptsPanel.hidden = false;
    conceptsList.innerHTML = "";
    for (const concept of concepts) {
      const li = document.createElement("li");
      li.className = "concept-item";
      li.id = `concept-${concept.id}`;

      const termRow = document.createElement("div");
      termRow.className = "concept-term-row";

      const term = document.createElement("span");
      term.className = "concept-term";
      term.textContent = concept.term ?? concept.id;

      const speakConcept = createSpeakButton(`Listen: ${concept.term}`, () => {
        const t = concept.term ?? concept.id;
        return `${t}. ${concept.definition ?? ""}`;
      });

      termRow.append(term, speakConcept);

      const def = document.createElement("p");
      def.className = "concept-definition";
      def.textContent = concept.definition ?? "";

      li.append(termRow, def);
      conceptsList.append(li);
    }
  }

  resultsEl.classList.remove("empty");
  resultsEl.hidden = false;
}

async function explainStreaming(code) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resultData = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6));

      switch (payload.type) {
        case "phase":
          if (payload.phase === "planning") {
            setProgress("plan");
            setStatus("Planning sections…");
          } else if (payload.phase === "explaining") {
            setProgress("explain");
            setStatus("Writing explanations…");
          }
          break;
        case "thinking_delta":
          appendBehind(payload.text ?? "", "thinking");
          break;
        case "answer_delta":
          break;
        case "error":
          throw new Error(payload.message ?? "Explain failed");
        case "result":
          resultData = payload.data;
          break;
        default:
          break;
      }
    }
  }

  if (!resultData) {
    throw new Error("No explanation returned");
  }
  return resultData;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;

  explainBtn.disabled = true;
  resetResults();
  setProgress("detect");
  setStatus("Detecting language…");
  detectLanguagePreview();

  try {
    setProgress("plan");
    setStatus("Planning sections…");
    const data = await explainStreaming(code);
    setProgress("done");
    setStatus("Done");
    renderExplainResult(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    setStatus(message, true);
    setProgress("idle");
  } finally {
    explainBtn.disabled = false;
  }
});

if (window.speechSynthesis) {
  speechSynthesis.addEventListener("voiceschanged", () => {
    voicesReady = true;
  });
}

fetch("/api/health")
  .then((r) => r.json())
  .then(({ hasApiKey }) => {
    if (!hasApiKey) {
      setStatus("Set CURSOR_API_KEY in .env", true);
    }
  })
  .catch(() => {});
