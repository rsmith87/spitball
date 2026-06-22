import type { ContextManagement, ThreadCompactionResult } from "../types";

export function contextManagementFromChatPayload(payload: Record<string, unknown>): ContextManagement {
  return {
    summarized: payload.summarized === true,
    ...(typeof payload.summary_event_id === "string" ? { summaryEventId: payload.summary_event_id } : {}),
    ...(typeof payload.prompt_tokens_before === "number" ? { promptTokensBefore: payload.prompt_tokens_before } : {}),
    ...(typeof payload.prompt_tokens_after === "number" ? { promptTokensAfter: payload.prompt_tokens_after } : {}),
  };
}

export function threadCompactionFromPayload(payload: Record<string, unknown>): ThreadCompactionResult {
  return {
    ...contextManagementFromChatPayload(payload),
    ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    ...(typeof payload.covered_event_count === "number" ? { coveredEventCount: payload.covered_event_count } : {}),
  };
}
