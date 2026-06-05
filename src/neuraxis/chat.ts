import { authHeaders, joinUrl, requestJson } from "./http";
import type { AuthState, ChatMessage } from "./types";
import { parseSseContent } from "./streaming";

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  request_type?: string | null;
  stream: boolean;
};

export async function sendChat(baseUrl: string, auth: AuthState, request: ChatCompletionRequest): Promise<string> {
  const payload = await requestJson<{ choices: Array<{ message: { content: string } }> }>(
    baseUrl,
    "/v1/chat/completions",
    { method: "POST", body: JSON.stringify(request) },
    auth,
  );
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
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
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
