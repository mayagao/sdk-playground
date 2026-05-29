import { Router } from "express";
import { Agent } from "@cursor/sdk";
import { DEFAULT_MODEL, MAX_EXPLAIN_CHARS } from "../config.js";
import { explainPrompt, followUpPrompt, planPrompt } from "../explain/prompts.js";
import {
  isExplainShape,
  isPlanShape,
  normalizePlanShape,
} from "../explain/validate.js";
import { resolveAssistantText } from "../lib/run-text.js";
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

      // Use agent mode: plan mode emits a Cursor implementation plan, not the JSON we need.
      const planRun = await agent.send(planPrompt(trimmed), {
        mode: "agent",
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

      let planText = await resolveAssistantText(planRun, planAnswer, planResult);
      let planParsed = normalizePlanShape(extractJsonFromText(planText));

      if (!isPlanShape(planParsed)) {
        let repairAnswer = "";

        const repairRun = await agent.send(
          `Your previous reply was not valid JSON for the section plan schema. Reply with ONLY one JSON object (no markdown fences, no commentary) with language, languageLabel, formattedCode, and sections[]. Use the same analysis as before.`,
          {
            mode: "agent",
            onDelta: createOnDeltaHandler(res, {
              phase: "planning",
              onAnswerText: (text) => {
                repairAnswer += text;
              },
            }),
          },
        );

        const repairResult = await waitForRun(
          repairRun,
          consumeToolCallStream(repairRun, res, "planning"),
        );

        if (repairResult.status !== "error") {
          planText = await resolveAssistantText(repairRun, repairAnswer, repairResult);
          planParsed = normalizePlanShape(extractJsonFromText(planText));
        }
      }

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

      const explainText = await resolveAssistantText(
        explainRun,
        explainAnswer,
        explainResult,
      );
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

      const enriched = { ...explainParsed, agentId: agent.agentId };
      writeSse(res, { type: "result", data: enriched });
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

  // POST /api/explain/:agentId/followup — follow-up run on an existing cloud agent.
  // Maps to the SDK's Agent.resume(...) + agent.send(...) which the API doc lists as
  // "Create A Run" (POST /v1/agents/{id}/runs).
  router.post("/:agentId/followup", async (req, res) => {
    const agentId = req.params.agentId?.trim();
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const sectionTitle =
      typeof req.body?.sectionTitle === "string" ? req.body.sectionTitle : undefined;
    const sectionCode =
      typeof req.body?.sectionCode === "string" ? req.body.sectionCode : undefined;
    const startLine =
      typeof req.body?.startLine === "number" ? req.body.startLine : undefined;
    const endLine =
      typeof req.body?.endLine === "number" ? req.body.endLine : undefined;

    if (!agentId || !agentId.startsWith("bc-")) {
      res.status(400).json({ error: "Valid cloud agent id is required" });
      return;
    }
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }
    if (!wantsEventStream(req.headers.accept)) {
      res.status(406).json({ error: "Accept: text/event-stream required" });
      return;
    }

    try {
      const apiKey = requireApiKey();
      initSse(res);

      await using agent = await Agent.resume(agentId, { apiKey });

      let answerText = "";

      const run = await agent.send(
        followUpPrompt({ question, sectionTitle, sectionCode, startLine, endLine }),
        {
          mode: "agent",
          onDelta: createOnDeltaHandler(res, {
            onAnswerText: (text) => {
              answerText += text;
            },
          }),
        },
      );

      const result = await waitForRun(run, consumeToolCallStream(run, res));

      if (result.status === "error") {
        writeSse(res, { type: "error", message: "Follow-up run failed", runId: result.id });
        res.end();
        return;
      }

      writeSse(res, {
        type: "done",
        text: answerText.trim() || (result.result ?? ""),
      });
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
