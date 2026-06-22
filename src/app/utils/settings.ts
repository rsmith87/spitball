export type ConnectionStatus = "missing" | "loaded" | "checking" | "ready" | "failed";

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_AGENT_TOOL_MAX_ITERATIONS = 12;
export const MAX_OUTPUT_TOKENS = 32768;
export const MAX_AGENT_TOOL_ITERATIONS = 32;

export function clampMaxTokens(value: number): number {
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(1, value));
}

export function clampAgentToolMaxIterations(value: number): number {
  return Math.min(MAX_AGENT_TOOL_ITERATIONS, Math.max(1, value));
}

export function connectionStatusLabel(status: ConnectionStatus): string {
  if (status === "ready") return "Connection ready";
  if (status === "checking") return "Checking connection";
  if (status === "failed") return "Connection check failed";
  if (status === "loaded") return "Saved connection loaded";
  return "Connection not configured";
}

export function projectIdForChatRequest(backendMode: string, toolRuntime: "agent" | undefined, selectedProjectId: string | undefined): string | undefined {
  if (toolRuntime !== "agent") return undefined;
  if (backendMode !== "agent" && backendMode !== "controller") return undefined;
  return selectedProjectId;
}
