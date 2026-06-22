import type { ContextManagement } from "../types";

export function contextManagementFromPayload(payload: Record<string, unknown>): ContextManagement | undefined {
  if (payload.type !== "context_management") return undefined;
  return {
    summarized: payload.summarized === true,
    ...(typeof payload.summary_event_id === "string" ? { summaryEventId: payload.summary_event_id } : {}),
    ...(typeof payload.prompt_tokens_before === "number" ? { promptTokensBefore: payload.prompt_tokens_before } : {}),
    ...(typeof payload.prompt_tokens_after === "number" ? { promptTokensAfter: payload.prompt_tokens_after } : {}),
  };
}
