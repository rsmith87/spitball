import type { ChatProgressEvent, ChatTelemetry } from "./types";

export type ChatStreamDelta = {
  content: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
  progress?: ChatProgressEvent;
};

export function parseSseContent(chunk: string): ChatStreamDelta[] {
  const values: ChatStreamDelta[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const payload = JSON.parse(data);
      if (payload.type === "thread" && typeof payload.thread_id === "string") {
        values.push({ content: "", threadId: payload.thread_id });
        continue;
      }
      const progress = progressFromPayload(payload);
      if (progress) {
        values.push({ content: "", progress });
        continue;
      }
      if (payload.type === "final") {
        const content = payload.choices?.[0]?.message?.content;
        values.push({ content: typeof content === "string" ? content : "" });
        continue;
      }
      const telemetry = telemetryFromPayload(payload);
      let emitted = false;
      for (const choice of payload.choices || []) {
        const content = choice?.delta?.content;
        if (typeof content === "string") {
          values.push(telemetry ? { content, telemetry } : { content });
          emitted = true;
        }
      }
      if (!emitted && telemetry) values.push({ content: "", telemetry });
    } catch {
      continue;
    }
  }
  return values;
}

function progressFromPayload(payload: Record<string, unknown>): ChatProgressEvent | undefined {
  if (payload.type !== "trace_event") return undefined;
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  const payloadBody = isRecord(payload.payload) ? payload.payload : {};
  if (eventType === "assistant_turn_started") return { id: "assistant-generating", type: "status", status: "running", label: "Generating" };
  if (eventType === "answer_verification_started" || eventType === "answer_verification_failed") {
    return { id: "answer-reviewing", type: "status", status: "running", label: "Reviewing generation" };
  }
  if (eventType === "tool_call_started" || eventType === "tool_call_completed" || eventType === "tool_call_failed") {
    const toolName = typeof payloadBody.tool_name === "string" ? payloadBody.tool_name : "tool";
    const status = eventType === "tool_call_started" ? "running" : eventType === "tool_call_failed" || payload.status === "failed" ? "failed" : "passed";
    const target = toolTarget(payloadBody);
    return {
      id: toolProgressId(payload, toolName, target.target),
      type: "tool",
      status,
      label: toolName,
      toolName,
      ...target,
    };
  }
  return undefined;
}

function toolProgressId(payload: Record<string, unknown>, toolName: string, target: string | undefined): string {
  const toolCallId = typeof payload.tool_call_id === "string" ? payload.tool_call_id : "";
  if (toolCallId) return `tool-${toolCallId}`;
  return `tool-${toolName}-${target || "call"}`;
}

function toolTarget(payload: Record<string, unknown>): { target?: string } {
  const args = isRecord(payload.arguments) ? payload.arguments : {};
  const rawPath = typeof args.path === "string" ? args.path : typeof args.file === "string" ? args.file : "";
  if (!rawPath) return {};
  const segments = rawPath.split(/[\\/]/).filter(Boolean);
  return { target: segments[segments.length - 1] || rawPath };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function telemetryFromPayload(payload: unknown): ChatTelemetry | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const item = payload as { usage?: Record<string, unknown>; timings?: Record<string, unknown> };
  const usage = item.usage || {};
  const timings = item.timings || {};
  const promptTokens = asNumber(usage.prompt_tokens);
  const completionTokens = asNumber(usage.completion_tokens);
  const promptMs = asNumber(timings.prompt_ms);
  const predictedMs = asNumber(timings.predicted_ms);
  const completionTimeMs = asNumber(usage.completion_time_ms);
  const completionMs = predictedMs ?? completionTimeMs;
  const predictedN = asNumber(timings.predicted_n);
  const completionN = predictedN ?? completionTokens;
  const tokensPerSecond = completionMs && completionN && completionMs > 0 ? (completionN * 1000) / completionMs : undefined;
  const telemetry: ChatTelemetry = {
    ...(promptTokens != null ? { promptTokens } : {}),
    ...(completionTokens != null ? { completionTokens } : {}),
    ...(promptMs != null ? { promptMs } : {}),
    ...(completionMs != null ? { completionMs } : {}),
    ...(tokensPerSecond != null ? { tokensPerSecond } : {}),
  };
  return Object.keys(telemetry).length ? telemetry : undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}
