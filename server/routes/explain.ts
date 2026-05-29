import { Router } from "express";
import { Agent } from "@cursor/sdk";
import { DEFAULT_MODEL, MAX_EXPLAIN_CHARS } from "../config.js";
import { explainPrompt, planPrompt } from "../explain/prompts.js";
import { isExplainShape, isPlanShape } from "../explain/validate.js";
import { requireApiKey } from "../lib/api-key.js";
import {
  consumeToolCallStream,
  createOnDeltaHandler,
  waitForRun,
} from "../lib/agent-stream.js";
import { sendJsonAgentError, sendJsonServerError, sendSseAgentError } from "../lib/errors.js";
import { extractJsonFromText } from "../lib/json.js";
import { initSse, wantsEventStream, writeSse } from "../lib/sse.js";

export function createExplainRouter(): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const trimmed = code.trim();
    if (!trimmed) {
      res.status(400).json({ error: "Code is required" });
      return;
    }
    if (trimmed.length > MAX_EXPLAIN_CHARS) {
      res.status(400).json({
        error: `Code exceeds maximum length (${MAX_EXPLAIN_CHARS} characters)`,
      });
      return;
    }

    if (!wantsEventStream(req.headers.accept)) {
      res.status(406).json({ error: "Accept: text/event-stream required" });
      return;
    }

    try {
      const apiKey = requireApiKey();
      initSse(res);
      writeSse(res, { type: "phase", phase: "planning" });

      await using agent = await Agent.create({
        apiKey,
        model: DEFAULT_MODEL,
        cloud: {},
        name: "Code explainer",
      });

      let planAnswer = "";

      const planRun = await agent.send(planPrompt(trimmed), {
        mode: "plan",
        onDelta: createOnDeltaHandler(res, {
          phase: "planning",
          onAnswerText: (text) => {
            planAnswer += text;
          },
        }),
      });

      const planResult = await waitForRun(
        planRun,
        consumeToolCallStream(planRun, res, "planning"),
      );

      if (planResult.status === "error") {
        writeSse(res, { type: "error", message: "Planning run failed", runId: planResult.id });
        res.end();
        return;
      }

      const planText = planAnswer.trim() || (planResult.result ?? "").trim();
      const planParsed = extractJsonFromText(planText);
      if (!isPlanShape(planParsed)) {
        writeSse(res, {
          type: "error",
          message: "Could not parse section plan from agent. Try again.",
          snippet: planText.slice(0, 400),
        });
        res.end();
        return;
      }

      writeSse(res, { type: "phase", phase: "explaining" });

      let explainAnswer = "";

      const explainRun = await agent.send(
        explainPrompt(JSON.stringify(planParsed, null, 2), trimmed),
        {
          mode: "agent",
          onDelta: createOnDeltaHandler(res, {
            phase: "explaining",
            onAnswerText: (text) => {
              explainAnswer += text;
            },
          }),
        },
      );

      const explainResult = await waitForRun(
        explainRun,
        consumeToolCallStream(explainRun, res, "explaining"),
      );

      if (explainResult.status === "error") {
        writeSse(res, {
          type: "error",
          message: "Explanation run failed",
          runId: explainResult.id,
        });
        res.end();
        return;
      }

      const explainText = explainAnswer.trim() || (explainResult.result ?? "").trim();
      const explainParsed = extractJsonFromText(explainText);
      if (!isExplainShape(explainParsed)) {
        writeSse(res, {
          type: "error",
          message: "Could not parse explanations from agent. Try again.",
          snippet: explainText.slice(0, 400),
        });
        res.end();
        return;
      }

      writeSse(res, { type: "result", data: explainParsed });
      res.end();
    } catch (err) {
      if (res.headersSent) {
        sendSseAgentError(res, err);
        return;
      }
      if (sendJsonAgentError(res, err)) return;
      sendJsonServerError(res, err);
    }
  });

  return router;
}
