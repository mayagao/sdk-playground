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
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const newExplainBtn = document.getElementById("new-explain");

const STORAGE_KEY = "sdk-playground-explains";
const DRAFT_KEY = "sdk-playground-explain-draft";
const MAX_EXPLAINS = 30;

marked.setOptions({ gfm: true, breaks: true });

let detectTimer = null;
let draftTimer = null;
let activeUtterance = null;
let speakingButton = null;
let voicesReady = false;
let behindLogEl = null;
let activeExplainId = null;
let activeAgentId = null;
let currentResultLanguage = "plaintext";

function scrollToLatest(container) {
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function scrollIntoViewSoft(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
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

function loadExplains() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExplains(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_EXPLAINS)));
  } catch (err) {
    console.warn("Could not save explanation history", err);
    setStatus("History full — remove older items or shorten pasted code", true);
  }
}

function saveDraft(code) {
  try {
    const trimmed = code.trim();
    if (!trimmed) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, code);
  } catch {
    /* quota */
  }
}

function restoreDraft() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft && !codeInput.value.trim()) {
      codeInput.value = draft;
      detectLanguagePreview();
    }
  } catch {
    /* ignore */
  }
}

function formatExplainDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateTitle(code, max = 48) {
  const firstLine = code.split("\n").find((l) => l.trim())?.trim() ?? code;
  const oneLine = firstLine.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine || "Untitled snippet";
  return `${oneLine.slice(0, max - 1)}…`;
}

function renderHistoryList() {
  const items = loadExplains();
  historyList.innerHTML = "";

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-btn";
    if (item.id === activeExplainId) btn.classList.add("active");
    btn.dataset.explainId = item.id;

    const title = document.createElement("span");
    title.className = "history-btn-title";
    title.textContent = item.title ?? truncateTitle(item.code);

    const meta = document.createElement("span");
    meta.className = "history-btn-date";
    const lang = item.languageLabel ? `${item.languageLabel} · ` : "";
    meta.textContent = `${lang}${formatExplainDate(item.createdAt)}`;

    btn.append(title, meta);
    btn.addEventListener("click", () => openExplain(item.id));
    li.append(btn);
    historyList.append(li);
  }

  historyEmpty.hidden = items.length > 0;
}

function persistExplain(code, result) {
  const entry = {
    id: crypto.randomUUID(),
    code,
    result,
    title: truncateTitle(code),
    languageLabel: result.languageLabel ?? result.language ?? "",
    agentId: result.agentId ?? null,
    createdAt: Date.now(),
  };

  const items = loadExplains();
  items.unshift(entry);
  saveExplains(items);
  activeExplainId = entry.id;
  saveDraft(code);
  renderHistoryList();
}

function openExplain(id) {
  const item = loadExplains().find((e) => e.id === id);
  if (!item?.result) return;

  stopSpeaking();
  activeExplainId = id;
  activeAgentId = item.result?.agentId ?? item.agentId ?? null;
  codeInput.value = item.code;
  detectLanguagePreview();
  saveDraft(item.code);

  behindContent.innerHTML = "";
  behindLogEl = null;
  behindScenes.hidden = true;
  behindScenes.open = false;

  renderExplainResult(item.result);
  setProgress("done");
  setStatus("Loaded from history");
  renderHistoryList();
}

function startNewExplain() {
  activeExplainId = null;
  activeAgentId = null;
  codeInput.value = "";
  localStorage.removeItem(DRAFT_KEY);
  detectedLangEl.hidden = true;
  resetResults();
  setStatus("");
  renderHistoryList();
  codeInput.focus();
}

codeInput.addEventListener("input", () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(detectLanguagePreview, 200);
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(codeInput.value), 400);
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

function buildCodePreview(code, language, { startCollapsed }) {
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const trimmed = code.replace(/\s+$/, "");
  const lineCount = trimmed.split("\n").length;
  const collapsible = lineCount > 1;
  wrapper.dataset.collapsed = collapsible && startCollapsed ? "true" : "false";

  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.className = `hljs language-${language}`;
  codeEl.innerHTML = highlightCode(trimmed, language);
  pre.append(codeEl);
  wrapper.append(pre);

  if (collapsible) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "code-toggle";
    const updateLabel = () => {
      toggle.textContent =
        wrapper.dataset.collapsed === "true"
          ? `Show all (${lineCount} lines)`
          : "Collapse";
    };
    updateLabel();
    toggle.addEventListener("click", () => {
      wrapper.dataset.collapsed = wrapper.dataset.collapsed === "true" ? "false" : "true";
      updateLabel();
    });
    wrapper.append(toggle);
  }

  return wrapper;
}

function importanceLabel(importance) {
  if (importance === "essential") return "Essential";
  if (importance === "noise") return "Boilerplate";
  return "Supporting";
}

async function runFollowUp({ question, section, threadEl, statusEl: localStatus, submitBtn }) {
  if (!activeAgentId) {
    localStatus.textContent = "Run Explain first to enable follow-ups for this snippet.";
    localStatus.classList.add("error");
    return;
  }

  const qaEl = document.createElement("div");
  qaEl.className = "followup-qa";

  const qEl = document.createElement("p");
  qEl.className = "followup-q";
  qEl.textContent = question;

  const aEl = document.createElement("div");
  aEl.className = "followup-a timeline-markdown";
  aEl.innerHTML = "<p class='muted'>Thinking…</p>";

  qaEl.append(qEl, aEl);
  threadEl.append(qaEl);
  scrollIntoViewSoft(qaEl);

  let buffered = "";
  const renderBuffered = () => {
    aEl.innerHTML = parseMarkdown(buffered) || "<p class='muted'>…</p>";
  };

  try {
    submitBtn.disabled = true;
    localStatus.textContent = "Asking…";
    localStatus.classList.remove("error");

    const res = await fetch(
      `/api/explain/${encodeURIComponent(activeAgentId)}/followup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          question,
          sectionTitle: section.title,
          sectionCode: section.code,
          startLine: section.startLine,
          endLine: section.endLine,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    let finalText = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.type === "answer_delta") {
          buffered += payload.text ?? "";
          renderBuffered();
        } else if (payload.type === "error") {
          throw new Error(payload.message ?? "Follow-up failed");
        } else if (payload.type === "done") {
          finalText = payload.text ?? buffered;
        }
      }
    }

    if (finalText && finalText.trim() && finalText.trim() !== buffered.trim()) {
      buffered = finalText;
      renderBuffered();
    }
    if (!buffered.trim()) {
      aEl.innerHTML = "<p class='muted'>(no answer)</p>";
    }

    const speakBtn = createSpeakButton("Listen to answer", () =>
      markdownToPlainText(buffered),
    );
    speakBtn.classList.add("btn-speak-inline");
    aEl.append(speakBtn);

    localStatus.textContent = "Done";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    aEl.innerHTML = `<p class="error-text">${message}</p>`;
    localStatus.textContent = message;
    localStatus.classList.add("error");
  } finally {
    submitBtn.disabled = false;
  }
}

function buildFollowUpBlock(section) {
  const wrap = document.createElement("div");
  wrap.className = "explain-followup";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "followup-toggle";
  toggle.textContent = "Ask a follow-up";

  const panel = document.createElement("div");
  panel.className = "followup-panel";
  panel.hidden = true;

  const formEl = document.createElement("form");
  formEl.className = "followup-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "followup-input";
  input.placeholder = "e.g. Why is mode set to plan here?";
  input.required = true;

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "followup-submit";
  submitBtn.textContent = "Ask";

  const localStatus = document.createElement("span");
  localStatus.className = "followup-status";

  formEl.append(input, submitBtn, localStatus);

  const thread = document.createElement("div");
  thread.className = "followup-thread";

  panel.append(formEl, thread);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.classList.toggle("open", !panel.hidden);
    if (!panel.hidden) {
      input.focus();
    }
  });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    await runFollowUp({ question, section, threadEl: thread, statusEl: localStatus, submitBtn });
  });

  if (!activeAgentId) {
    toggle.disabled = true;
    toggle.title = "Run Explain to enable follow-ups";
  }

  wrap.append(toggle, panel);
  return wrap;
}

function resetResults() {
  stopSpeaking();
  resultsEl.hidden = true;
  resultsEl.classList.add("empty");
  sectionsEl.innerHTML = "";
  conceptsPanel.hidden = true;
  conceptsList.innerHTML = "";
  behindContent.innerHTML = "";
  behindLogEl = null;
  behindScenes.hidden = true;
  behindScenes.open = false;
  setProgress("idle");
}

function appendBehind(text, kind) {
  const chunk = text ?? "";
  if (!chunk) return;

  behindScenes.hidden = false;
  behindScenes.open = true;

  if (kind === "thinking") {
    if (!behindLogEl) {
      behindLogEl = document.createElement("pre");
      behindLogEl.className = "behind-log";
      behindContent.append(behindLogEl);
      scrollIntoViewSoft(behindScenes);
    }
    behindLogEl.textContent += chunk;
    scrollToLatest(behindContent);
    return;
  }

  const el = document.createElement("p");
  el.className = `behind-${kind}`;
  el.textContent = chunk;
  behindContent.append(el);
  scrollToLatest(behindContent);
}

function renderExplainResult(data) {
  const language = data.language ?? "plaintext";
  const languageLabel = data.languageLabel ?? language;
  const formattedCode = data.formattedCode ?? "";
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const concepts = Array.isArray(data.concepts) ? data.concepts : [];
  currentResultLanguage = language;

  if (data.agentId) activeAgentId = data.agentId;

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

    const importanceBadge = document.createElement("span");
    importanceBadge.className = `importance-badge importance-${importance}`;
    importanceBadge.textContent = importanceLabel(importance);

    const speakSummary = createSpeakButton("Listen to explanation", () =>
      markdownToPlainText(section.summary ?? ""),
    );

    header.append(title, lineRange, importanceBadge, speakSummary);

    const grid = document.createElement("div");
    grid.className = "explain-card-grid";

    const codeCol = document.createElement("div");
    codeCol.className = "explain-card-code";
    if (section.code?.trim()) {
      const startCollapsed = importance !== "essential";
      codeCol.append(buildCodePreview(section.code, language, { startCollapsed }));
    } else {
      codeCol.classList.add("empty");
    }

    const summaryCol = document.createElement("div");
    summaryCol.className = "explain-card-summary timeline-markdown";
    summaryCol.innerHTML = parseMarkdown(section.summary ?? "");

    grid.append(codeCol, summaryCol);
    card.append(header, grid);

    card.append(buildFollowUpBlock(section));

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
        const ex = concept.example ? `. Example: ${concept.example}` : "";
        return `${t}. ${concept.definition ?? ""}${ex}`;
      });

      termRow.append(term, speakConcept);

      const def = document.createElement("p");
      def.className = "concept-definition";
      def.textContent = concept.definition ?? "";

      li.append(termRow, def);

      if (concept.example?.trim()) {
        const pre = document.createElement("pre");
        pre.className = "concept-example";
        const codeEl = document.createElement("code");
        codeEl.className = `hljs language-${language}`;
        codeEl.innerHTML = highlightCode(concept.example, language);
        pre.append(codeEl);
        li.append(pre);
      }

      conceptsList.append(li);
    }
  }

  resultsEl.classList.remove("empty");
  resultsEl.hidden = false;

  const lastCard = sectionsEl.querySelector(".explain-card:last-child");
  scrollIntoViewSoft(lastCard ?? resultsEl);
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
            scrollIntoViewSoft(behindScenes);
          } else if (payload.phase === "explaining") {
            setProgress("explain");
            setStatus("Writing explanations…");
            scrollIntoViewSoft(behindScenes);
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
  activeExplainId = null;
  activeAgentId = null;
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
    persistExplain(code, data);
    saveDraft(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    setStatus(message, true);
    setProgress("idle");
  } finally {
    explainBtn.disabled = false;
  }
});

newExplainBtn.addEventListener("click", startNewExplain);

if (window.speechSynthesis) {
  speechSynthesis.addEventListener("voiceschanged", () => {
    voicesReady = true;
  });
}

renderHistoryList();
restoreDraft();

fetch("/api/health")
  .then((r) => r.json())
  .then(({ hasApiKey }) => {
    if (!hasApiKey) {
      setStatus("Set CURSOR_API_KEY in .env", true);
    }
  })
  .catch(() => {});
