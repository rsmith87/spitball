import { authHeaders, joinUrl, requestJson } from "./http";
import type { AuthState, ChatMessage, ChatTelemetry, ContextBudget, ContextManagement, ThreadCompactionResult } from "./types";
import { parseSseContent, telemetryFromPayload, type ChatStreamDelta } from "./streaming";

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  request_type?: string | null;
  stream: boolean;
  max_tokens: number;
  agent_tool_max_iterations?: number;
  thread_id?: string;
  tool_runtime?: "agent";
};

export type ChatCompletionResult = {
  content: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
  contextManagement?: ContextManagement;
};

export type CompactThreadRequest = {
  threadId: string;
  model: string;
  target: string;
  recentMessageCount: number;
};

export async function getContextBudget(
  baseUrl: string,
  auth: AuthState,
  request: ChatCompletionRequest,
  maxTokens: number,
): Promise<ContextBudget> {
  return requestJson<ContextBudget>(
    baseUrl,
    `/lm-api/v1/chat/${encodeURIComponent(request.model)}/context-budget`,
    {
      method: "POST",
      body: JSON.stringify({
        messages: request.messages,
        request_type: request.request_type,
        max_tokens: maxTokens,
        thread_id: request.thread_id,
      }),
    },
    auth,
  );
}

export async function compactThread(
  baseUrl: string,
  auth: AuthState,
  request: CompactThreadRequest,
): Promise<ThreadCompactionResult> {
  const payload = await requestJson<Record<string, unknown>>(
    baseUrl,
    `/lm-api/v1/threads/${encodeURIComponent(request.threadId)}/compact`,
    {
      method: "POST",
      body: JSON.stringify({
        model: request.model,
        target: request.target,
        recent_message_count: request.recentMessageCount,
      }),
    },
    auth,
  );
  return threadCompactionFromPayload(payload);
}

export async function stopGeneration(
  baseUrl: string,
  auth: AuthState,
  model: string,
  slotId: number,
  target: string,
): Promise<void> {
  await requestJson<Record<string, unknown>>(
    baseUrl,
    `/lm-api/v1/chat/${encodeURIComponent(model)}/kv/slots/${slotId}`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "cancel",
        target,
      }),
    },
    auth,
  );
}

export async function sendChat(baseUrl: string, auth: AuthState, request: ChatCompletionRequest): Promise<ChatCompletionResult> {
  let payload: {
    choices: Array<{ message: { content: string } }>;
    thread_id?: string;
    usage?: Record<string, unknown>;
    timings?: Record<string, unknown>;
    context_management?: Record<string, unknown>;
  };
  try {
    payload = await requestJson<{
      choices: Array<{ message: { content: string } }>;
      thread_id?: string;
      usage?: Record<string, unknown>;
      timings?: Record<string, unknown>;
      context_management?: Record<string, unknown>;
    }>(
      baseUrl,
      "/v1/chat/completions",
      { method: "POST", body: JSON.stringify(request) },
      auth,
    );
  } catch (error) {
    throw formatChatError(error, request);
  }
  const telemetry = telemetryFromPayload(payload);
  return {
    content: payload.choices[0]?.message?.content || "",
    ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
    ...(telemetry ? { telemetry } : {}),
    ...(payload.context_management ? { contextManagement: contextManagementFromPayload(payload.context_management) } : {}),
  };
}

export async function streamChat(
  baseUrl: string,
  auth: AuthState,
  request: ChatCompletionRequest,
  onToken: (delta: ChatStreamDelta) => void,
): Promise<void> {
  const response = await fetch(joinUrl(baseUrl, "/v1/chat/completions"), {
    method: "POST",
    body: JSON.stringify({ ...request, stream: true }),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      ...authHeaders(auth),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw formatChatError(new Error(`${response.status} ${response.statusText}: ${text}`), request);
  }
  if (!response.body) throw new Error(`${response.status} ${response.statusText}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      for (const token of parseSseContent(part)) {
        if (token.error) throw formatChatError(new Error(token.error), request);
        onToken(token);
      }
    }
  }
}

function formatChatError(error: unknown, request: ChatCompletionRequest): Error {
  const message = error instanceof Error ? error.message : "Chat failed";
  const detail = backendDetail(message);
  if (isModelNotRunningDetail(detail)) {
    return new Error(
      `The selected model is not up: ${request.model}. Start or load it in Llama Pack, then try again. Backend detail: ${detail}`,
    );
  }
  if (request.tool_runtime !== "agent") return new Error(message);
  if (!isAgentToolRuntimeDetail(detail)) return new Error(message);
  const base =
    "Agent tools could not run: the selected agent has tools disabled or no tool catalog/profile configured. Enable agent tools on that node, then try again.";
  return new Error(detail ? `${base} Backend detail: ${detail}` : base);
}

function contextManagementFromPayload(payload: Record<string, unknown>): ContextManagement {
  return {
    summarized: payload.summarized === true,
    ...(typeof payload.summary_event_id === "string" ? { summaryEventId: payload.summary_event_id } : {}),
    ...(typeof payload.prompt_tokens_before === "number" ? { promptTokensBefore: payload.prompt_tokens_before } : {}),
    ...(typeof payload.prompt_tokens_after === "number" ? { promptTokensAfter: payload.prompt_tokens_after } : {}),
  };
}

function threadCompactionFromPayload(payload: Record<string, unknown>): ThreadCompactionResult {
  return {
    ...contextManagementFromPayload(payload),
    ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    ...(typeof payload.covered_event_count === "number" ? { coveredEventCount: payload.covered_event_count } : {}),
  };
}

function isModelNotRunningDetail(detail: string): boolean {
  return detail.toLowerCase().includes("model is not running");
}

function isAgentToolRuntimeDetail(detail: string): boolean {
  const lower = detail.toLowerCase();
  return lower.includes("agent tool runtime") || lower.includes("tool catalog") || lower.includes("tools disabled");
}

function backendDetail(message: string): string {
  const jsonStart = message.indexOf("{");
  if (jsonStart < 0) return message.trim();
  try {
    const payload = JSON.parse(message.slice(jsonStart)) as { detail?: unknown };
    return typeof payload.detail === "string" ? payload.detail : message.trim();
  } catch {
    return message.trim();
  }
}
