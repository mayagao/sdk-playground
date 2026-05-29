import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Agent, CursorAgentError } from "@cursor/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3456;
const REPO_CWD = process.cwd();

function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    throw new CursorAgentError("CURSOR_API_KEY is not set");
  }
  return key;
}

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.CURSOR_API_KEY?.trim()) });
});

app.post("/api/ask", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const wantsStream = req.headers.accept?.includes("text/event-stream");

  try {
    const apiKey = requireApiKey();

    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      await using agent = await Agent.create({
        apiKey,
        model: { id: "composer-2.5" },
        local: { cwd: REPO_CWD },
      });

      const run = await agent.send(prompt, {
        onDelta: ({ update }) => {
          if (update.type === "thinking-delta" && update.text) {
            res.write(
              `data: ${JSON.stringify({ type: "thinking_delta", text: update.text })}\n\n`,
            );
          } else if (update.type === "text-delta" && update.text) {
            res.write(
              `data: ${JSON.stringify({ type: "answer_delta", text: update.text })}\n\n`,
            );
          } else if (update.type === "thinking-completed") {
            res.write(
              `data: ${JSON.stringify({
                type: "thinking_done",
                durationMs: update.thinkingDurationMs,
              })}\n\n`,
            );
          }
        },
      });

      const consumeStream = (async () => {
        for await (const event of run.stream()) {
          if (event.type === "tool_call") {
            res.write(
              `data: ${JSON.stringify({
                type: "tool",
                callId: event.call_id,
                name: event.name,
                status: event.status,
              })}\n\n`,
            );
          }
        }
      })();

      const result = await Promise.all([consumeStream, run.wait()]).then(
        ([, runResult]) => runResult,
      );
      if (result.status === "error") {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Run failed", runId: result.id })}\n\n`,
        );
      } else {
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            status: result.status,
            result: result.result ?? "",
          })}\n\n`,
        );
      }
      res.end();
      return;
    }

    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2.5" },
      local: { cwd: REPO_CWD },
    });

    if (result.status === "error") {
      res.status(502).json({ error: "Run failed", runId: result.id });
      return;
    }

    res.json({
      status: result.status,
      answer: result.result ?? "",
      durationMs: result.durationMs,
    });
  } catch (err) {
    if (err instanceof CursorAgentError) {
      const status = err.message.includes("CURSOR_API_KEY") ? 503 : 500;
      res.status(status).json({ error: err.message, retryable: err.isRetryable });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Ask app: http://localhost:${PORT}`);
  if (!process.env.CURSOR_API_KEY?.trim()) {
    console.warn("Set CURSOR_API_KEY in .env (see .env.example)");
  }
});
