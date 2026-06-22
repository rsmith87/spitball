import type { ChatProgressEvent, ChatTelemetry, ContextManagement, MessageVerification, VerificationIssue } from "./types";

export type ChatStreamDelta = {
  content: string;
  error?: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
  progress?: ChatProgressEvent;
  contextManagement?: ContextManagement;
  verification?: MessageVerification;
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
      if (payload.type === "error" && typeof payload.error === "string") {
        values.push({ content: "", error: payload.error });
        continue;
      }
      const contextManagement = contextManagementFromPayload(payload);
      if (contextManagement) {
        values.push({ content: "", contextManagement });
        continue;
      }
      const progress = progressFromPayload(payload);
      if (progress) {
        values.push({ content: "", progress });
        continue;
      }
      if (payload.type === "final") {
        const content = payload.choices?.[0]?.message?.content;
        const verification = verificationFromChatPayload(payload);
        values.push({
          content: typeof content === "string" ? content : "",
          ...(verification ? { verification } : {}),
        });
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

function contextManagementFromPayload(payload: Record<string, unknown>): ContextManagement | undefined {
  if (payload.type !== "context_management") return undefined;
  return {
    summarized: payload.summarized === true,
    ...(typeof payload.summary_event_id === "string" ? { summaryEventId: payload.summary_event_id } : {}),
    ...(typeof payload.prompt_tokens_before === "number" ? { promptTokensBefore: payload.prompt_tokens_before } : {}),
    ...(typeof payload.prompt_tokens_after === "number" ? { promptTokensAfter: payload.prompt_tokens_after } : {}),
  };
}

function progressFromPayload(payload: Record<string, unknown>): ChatProgressEvent | undefined {
  if (payload.type !== "trace_event") return undefined;
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  const payloadBody = isRecord(payload.payload) ? payload.payload : {};
  if (eventType === "assistant_turn_started") return { id: "assistant-generating", type: "status", status: "running", label: "Generating" };
  if (eventType === "answer_verification_started") {
    return { id: "answer-reviewing", type: "status", status: "running", label: "Reviewing generation" };
  }
  if (eventType === "answer_verification_failed") {
    return {
      id: "answer-reviewing",
      type: "status",
      status: "failed",
      label: "Needs verification",
      verification: verificationFromTracePayload(payloadBody),
    };
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

function toolTarget(payload: Record<string, unknown>): { target?: string; detail?: string } {
  const args = isRecord(payload.arguments) ? payload.arguments : {};
  const rawPath = typeof args.path === "string" ? args.path : typeof args.file === "string" ? args.file : "";
  const detail = lineDetail(args);
  if (!rawPath) return detail ? { detail } : {};
  const segments = rawPath.split(/[\\/]/).filter(Boolean);
  return {
    target: segments[segments.length - 1] || rawPath,
    ...(detail ? { detail } : {}),
  };
}

function lineDetail(args: Record<string, unknown>): string | undefined {
  const start = lineNumber(args.start_line) ?? lineNumber(args.startLine) ?? lineNumber(args.line_start) ?? lineNumber(args.lineStart) ?? lineNumber(args.line);
  const end = lineNumber(args.end_line) ?? lineNumber(args.endLine) ?? lineNumber(args.line_end) ?? lineNumber(args.lineEnd);
  if (start == null && end == null) return undefined;
  if (start != null && end != null && start !== end) return `L${start}-L${end}`;
  return `L${start ?? end}`;
}

function lineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function verificationFromChatPayload(payload: unknown): MessageVerification | undefined {
  if (!isRecord(payload)) return undefined;
  const llamaPack = payload.llama_pack;
  if (!isRecord(llamaPack)) return undefined;
  return verificationFromPayload(llamaPack.verification);
}

export function verificationFromPayload(payload: unknown): MessageVerification | undefined {
  if (!isRecord(payload)) return undefined;
  const status = payload.status;
  if (!isVerificationStatus(status)) return undefined;
  return {
    status,
    issues: Array.isArray(payload.issues) ? payload.issues.flatMap(verificationIssueFromPayload) : [],
  };
}

function verificationFromTracePayload(payload: Record<string, unknown>): MessageVerification {
  return {
    status: "failed",
    issues: Array.isArray(payload.issues) ? payload.issues.flatMap(verificationIssueFromPayload) : [],
  };
}

function verificationIssueFromPayload(value: unknown): VerificationIssue[] {
  if (!isRecord(value)) return [];
  const kind = value.kind;
  const severity = value.severity;
  const start = value.start;
  const end = value.end;
  if (kind !== "missing_path" && kind !== "missing_symbol" && kind !== "missing_source_evidence") return [];
  if (severity !== "warning" && severity !== "failed") return [];
  if (typeof value.value !== "string" || typeof value.excerpt !== "string") return [];
  if (!Number.isInteger(start) || !Number.isInteger(end) || typeof start !== "number" || typeof end !== "number") return [];
  return [{ kind, value: value.value, start, end, excerpt: value.excerpt, severity }];
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

function isVerificationStatus(value: unknown): value is MessageVerification["status"] {
  return (
    value === "verified"
    || value === "no_code_claims"
    || value === "unverified"
    || value === "unavailable"
    || value === "warning"
    || value === "failed"
  );
}
