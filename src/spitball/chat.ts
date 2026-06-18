import { authHeaders, joinUrl, requestJson } from "./http";
import type { AuthState, ChatMessage, ContextBudget } from "./types";
import { parseSseContent } from "./streaming";

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  request_type?: string | null;
  stream: boolean;
  tool_runtime?: "agent";
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
      }),
    },
    auth,
  );
}

export async function sendChat(baseUrl: string, auth: AuthState, request: ChatCompletionRequest): Promise<string> {
  let payload: { choices: Array<{ message: { content: string } }> };
  try {
    payload = await requestJson<{ choices: Array<{ message: { content: string } }> }>(
      baseUrl,
      "/v1/chat/completions",
      { method: "POST", body: JSON.stringify(request) },
      auth,
    );
  } catch (error) {
    throw formatChatError(error, request);
  }
  return payload.choices[0]?.message?.content || "";
}

export async function streamChat(
  baseUrl: string,
  auth: AuthState,
  request: ChatCompletionRequest,
  onToken: (token: string) => void,
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
      for (const token of parseSseContent(part)) onToken(token);
    }
  }
}

function formatChatError(error: unknown, request: ChatCompletionRequest): Error {
  const message = error instanceof Error ? error.message : "Chat failed";
  if (request.tool_runtime !== "agent") return new Error(message);
  const detail = backendDetail(message);
  const base =
    "Agent tools could not run: the selected agent has tools disabled or no tool catalog/profile configured. Enable agent tools on that node, then try again.";
  return new Error(detail ? `${base} Backend detail: ${detail}` : base);
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
