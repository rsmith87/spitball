import type { ChatCompletionRequest } from "./types";

export function formatChatError(error: unknown, request: ChatCompletionRequest): Error {
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
