import type { Response } from "express";
import type { InteractionUpdate, Run } from "@cursor/sdk";
import { writeSse } from "./sse.js";

export type ExplainPhase = "planning" | "explaining";

export function createOnDeltaHandler(
  res: Response,
  options: {
    phase?: ExplainPhase;
    onAnswerText?: (text: string) => void;
  } = {},
): (args: { update: InteractionUpdate }) => void {
  const { phase, onAnswerText } = options;

  return ({ update }) => {
    if (update.type === "thinking-delta" && update.text) {
      writeSse(res, {
        type: "thinking_delta",
        ...(phase ? { phase } : {}),
        text: update.text,
      });
    } else if (update.type === "text-delta" && update.text) {
      onAnswerText?.(update.text);
      writeSse(res, {
        type: "answer_delta",
        ...(phase ? { phase } : {}),
        text: update.text,
      });
    } else if (update.type === "thinking-completed") {
      writeSse(res, {
        type: "thinking_done",
        ...(phase ? { phase } : {}),
        durationMs: update.thinkingDurationMs,
      });
    }
  };
}

export function consumeToolCallStream(
  run: Run,
  res: Response,
  phase?: ExplainPhase,
): Promise<void> {
  return (async () => {
    for await (const event of run.stream()) {
      if (event.type === "tool_call") {
        writeSse(res, {
          type: "tool",
          ...(phase ? { phase } : {}),
          callId: event.call_id,
          name: event.name,
          status: event.status,
        });
      }
    }
  })();
}

export async function waitForRun(run: Run, streamTask: Promise<void>) {
  const [, result] = await Promise.all([streamTask, run.wait()]);
  return result;
}
