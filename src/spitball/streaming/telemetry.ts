import type { ChatTelemetry } from "../types";

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
