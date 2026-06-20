import type { ChatTelemetry } from "./types";

export type ChatStreamDelta = {
  content: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
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
