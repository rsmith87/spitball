import { requestJson } from "./http";
import type { AuthState, ClientSession } from "./types";

export function getClientSession(baseUrl: string, auth: AuthState): Promise<ClientSession> {
  return requestJson<ClientSession>(baseUrl, "/v1/client/session", {}, auth);
}
