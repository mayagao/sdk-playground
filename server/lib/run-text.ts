import type { ConversationTurn, Run } from "@cursor/sdk";

export function finalAssistantTextFromTurns(turns: ConversationTurn[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.type !== "agentConversationTurn") continue;

    const steps = turn.turn.steps;
    for (let j = steps.length - 1; j >= 0; j--) {
      const step = steps[j];
      if (step.type === "assistantMessage") {
        return step.message.text;
      }
    }
  }
  return undefined;
}

/** Prefer streamed deltas, then run.result, then conversation transcript. */
export async function resolveAssistantText(
  run: Run,
  streamedText: string,
  runResult?: { result?: string },
): Promise<string> {
  const fromStream = streamedText.trim();
  if (fromStream) return fromStream;

  const fromResult = (runResult?.result ?? run.result ?? "").trim();
  if (fromResult) return fromResult;

  if (!run.supports("conversation")) {
    return "";
  }

  try {
    const turns = await run.conversation();
    return finalAssistantTextFromTurns(turns)?.trim() ?? "";
  } catch {
    return "";
  }
}
