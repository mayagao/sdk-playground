import { marked } from "marked";
import DOMPurify from "dompurify";

const STORAGE_KEY = "sdk-playground-chats";
const MAX_CHATS = 50;

const form = document.getElementById("ask-form");
const promptEl = document.getElementById("prompt");
const answerEl = document.getElementById("answer");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const historyList = document.getElementById("history-list");
const newChatBtn = document.getElementById("new-chat");

marked.setOptions({ gfm: true, breaks: true });

/** @type {TimelineBlock[]} */
let blocks = [];
let renderQueued = false;
let blockId = 0;
let activeChatId = null;

function nextId() {
  return `b-${++blockId}`;
}

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
  if (!raw.trim()) return "";
  return DOMPurify.sanitize(marked.parse(raw, { async: false }));
}

function lastBlock() {
  return blocks[blocks.length - 1];
}

function appendThinking(text) {
  const chunk = text ?? "";
  if (!chunk) return;
  const last = lastBlock();
  if (last?.kind === "thinking" && !last.closed) {
    last.text += chunk;
  } else {
    blocks.push({ kind: "thinking", id: nextId(), text: chunk, closed: false });
  }
  scheduleRender();
}

function closeThinking(durationMs) {
  const last = lastBlock();
  if (last?.kind === "thinking" && !last.closed) {
    last.closed = true;
    if (durationMs != null) last.durationMs = durationMs;
  }
  scheduleRender();
}

function upsertTool(callId, name, status) {
  const key = callId ?? `${name}`;
  let block = blocks.find((b) => b.kind === "tool" && b.callId === key);
  if (!block) {
    block = { kind: "tool", id: nextId(), callId: key, name, status };
    blocks.push(block);
  } else {
    block.name = name;
    block.status = status;
  }
  scheduleRender();
}

function appendAnswer(text) {
  const chunk = text ?? "";
  if (!chunk) return;
  const last = lastBlock();
  if (last?.kind === "answer") {
    last.text += chunk;
  } else {
    blocks.push({ kind: "answer", id: nextId(), text: chunk });
  }
  scheduleRender();
}

function renderBlock(block) {
  if (block.kind === "thinking") {
    const label = block.closed && block.durationMs != null
      ? `Thinking (${(block.durationMs / 1000).toFixed(1)}s)`
      : block.closed
        ? "Thinking"
        : "Thinking…";
    const body = parseMarkdown(block.text);
    const open = block.closed ? "" : " open";
    return `<details class="timeline-block block-thinking"${open}>
      <summary>${escapeHtml(label)}</summary>
      <div class="timeline-markdown">${body || "<p class='muted'>…</p>"}</div>
    </details>`;
  }

  if (block.kind === "tool") {
    const statusClass = `status-${block.status}`;
    return `<div class="timeline-block block-tool ${statusClass}">
      <span class="tool-icon" aria-hidden="true">⚙</span>
      <span class="tool-name">${escapeHtml(block.name)}</span>
      <span class="tool-status">${escapeHtml(block.status)}</span>
    </div>`;
  }

  return `<div class="timeline-block block-answer">
    <div class="timeline-markdown">${parseMarkdown(block.text)}</div>
  </div>`;
}

function renderTimeline() {
  if (blocks.length === 0) {
    answerEl.classList.add("empty");
    answerEl.textContent = "Ask something to get started.";
    return;
  }

  answerEl.classList.remove("empty");
  answerEl.innerHTML = blocks.map(renderBlock).join("");
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderTimeline();
  });
}

function resetOutput() {
  blocks = [];
  blockId = 0;
  answerEl.innerHTML = "";
  answerEl.classList.add("empty");
  answerEl.textContent = "Ask something to get started.";
}

function getAnswerText() {
  return blocks
    .filter((b) => b.kind === "answer")
    .map((b) => b.text)
    .join("");
}

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChats(chats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
}

function formatChatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateTitle(prompt, max = 48) {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function renderHistoryList() {
  const chats = loadChats();
  historyList.innerHTML = "";

  for (const chat of chats) {
    const li = document.createElement("li");
    li.className = "history-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-btn";
    if (chat.id === activeChatId) btn.classList.add("active");
    btn.dataset.chatId = chat.id;

    const title = document.createElement("span");
    title.className = "history-btn-title";
    title.textContent = truncateTitle(chat.prompt);

    const date = document.createElement("span");
    date.className = "history-btn-date";
    date.textContent = formatChatDate(chat.createdAt);

    btn.append(title, date);
    btn.addEventListener("click", () => openChat(chat.id));
    li.append(btn);
    historyList.append(li);
  }
}

function persistChat(prompt) {
  if (blocks.length === 0) return;

  const chat = {
    id: crypto.randomUUID(),
    prompt,
    blocks: JSON.parse(JSON.stringify(blocks)),
    createdAt: Date.now(),
  };

  const chats = loadChats();
  chats.unshift(chat);
  saveChats(chats);
  activeChatId = chat.id;
  renderHistoryList();
}

function openChat(id) {
  const chat = loadChats().find((c) => c.id === id);
  if (!chat) return;

  activeChatId = id;
  promptEl.value = chat.prompt;
  blocks = JSON.parse(JSON.stringify(chat.blocks));
  blockId = blocks.length;
  renderTimeline();
  setStatus("Loaded from history");
  renderHistoryList();
}

function startNewChat() {
  activeChatId = null;
  promptEl.value = "";
  resetOutput();
  setStatus("");
  renderHistoryList();
  promptEl.focus();
}

function handleEvent(payload) {
  switch (payload.type) {
    case "thinking_delta":
      appendThinking(payload.text);
      break;
    case "thinking":
      if (payload.text) appendThinking(payload.text);
      break;
    case "thinking_done":
      closeThinking(payload.durationMs);
      break;
    case "answer_delta":
    case "delta":
      appendAnswer(payload.text);
      break;
    case "tool":
      upsertTool(payload.callId, payload.name ?? "tool", payload.status ?? "running");
      break;
    case "error":
      throw new Error(payload.message ?? "Run failed");
    case "done":
      if (payload.result && !getAnswerText().trim()) {
        appendAnswer(payload.result);
      }
      break;
    default:
      break;
  }
}

async function askStreaming(prompt) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      handleEvent(JSON.parse(line.slice(6)));
    }
  }

  return getAnswerText();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  submitBtn.disabled = true;
  activeChatId = null;
  setStatus("Running…");
  resetOutput();

  try {
    const answer = await askStreaming(prompt);
    const hasContent = blocks.length > 0;
    setStatus(hasContent ? "Done" : "No content in response");
    if (!hasContent) {
      answerEl.classList.add("empty");
      answerEl.textContent = "(empty response)";
    } else {
      if (!answer.trim() && blocks.every((b) => b.kind !== "answer")) {
        setStatus("Done (thinking & tools only)");
      }
      persistChat(prompt);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    setStatus(message, true);
    answerEl.classList.remove("empty");
    answerEl.textContent = message;
  } finally {
    submitBtn.disabled = false;
  }
});

newChatBtn.addEventListener("click", startNewChat);

renderHistoryList();

fetch("/api/health")
  .then((r) => r.json())
  .then(({ hasApiKey }) => {
    if (!hasApiKey) {
      setStatus("Set CURSOR_API_KEY in .env", true);
    }
  })
  .catch(() => {});
