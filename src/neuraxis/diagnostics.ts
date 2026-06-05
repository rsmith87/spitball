import { requestJson } from "./http";
import type { AuthState, ChatDiagnostic } from "./types";

export type ChatDiagnosticRequest = {
  model: string;
  request_type?: string | null;
  stream: boolean;
};

export function runChatDiagnostics(baseUrl: string, auth: AuthState, body: ChatDiagnosticRequest): Promise<ChatDiagnostic> {
  return requestJson<ChatDiagnostic>(
    baseUrl,
    "/v1/client/diagnostics/chat",
    { method: "POST", body: JSON.stringify(body) },
    auth,
  );
}
