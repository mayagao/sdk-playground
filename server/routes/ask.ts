import { Router } from "express";
import { Agent } from "@cursor/sdk";
import { DEFAULT_MODEL, REPO_CWD } from "../config.js";
import { requireApiKey } from "../lib/api-key.js";
import {
  consumeToolCallStream,
  createOnDeltaHandler,
  waitForRun,
} from "../lib/agent-stream.js";
import { sendJsonAgentError, sendJsonServerError } from "../lib/errors.js";
import { initSse, wantsEventStream, writeSse } from "../lib/sse.js";

export function createAskRouter(): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const stream = wantsEventStream(req.headers.accept);

    try {
      const apiKey = requireApiKey();

      if (stream) {
        initSse(res);

        await using agent = await Agent.create({
          apiKey,
          model: DEFAULT_MODEL,
          local: { cwd: REPO_CWD },
        });

        const run = await agent.send(prompt, {
          onDelta: createOnDeltaHandler(res),
        });

        const result = await waitForRun(run, consumeToolCallStream(run, res));

        if (result.status === "error") {
          writeSse(res, { type: "error", message: "Run failed", runId: result.id });
        } else {
          writeSse(res, {
            type: "done",
            status: result.status,
            result: result.result ?? "",
          });
        }
        res.end();
        return;
      }

      const result = await Agent.prompt(prompt, {
        apiKey,
        model: DEFAULT_MODEL,
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
      if (sendJsonAgentError(res, err)) return;
      sendJsonServerError(res, err);
    }
  });

  return router;
}
