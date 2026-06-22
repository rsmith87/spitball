import { authHeaders, joinUrl, requestJson } from "./http";
import { formatChatError } from "./chat/errorFormatting";
import { contextManagementFromChatPayload, threadCompactionFromPayload } from "./chat/mappers";
import type { ChatCompletionRequest, ChatCompletionResult, CompactThreadRequest } from "./chat/types";
import type { AuthState, ContextBudget, ThreadCompactionResult } from "./types";
import { parseSseContent, telemetryFromPayload, verificationFromChatPayload, type ChatStreamDelta } from "./streaming";

export type { ChatCompletionRequest, ChatCompletionResult, CompactThreadRequest } from "./chat/types";

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
    llama_pack?: Record<string, unknown>;
  };
  try {
    payload = await requestJson<{
      choices: Array<{ message: { content: string } }>;
      thread_id?: string;
      usage?: Record<string, unknown>;
      timings?: Record<string, unknown>;
      context_management?: Record<string, unknown>;
      llama_pack?: Record<string, unknown>;
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
  const verification = verificationFromChatPayload(payload);
  return {
    content: payload.choices[0]?.message?.content || "",
    ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
    ...(telemetry ? { telemetry } : {}),
    ...(payload.context_management ? { contextManagement: contextManagementFromChatPayload(payload.context_management) } : {}),
    ...(verification ? { verification } : {}),
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
