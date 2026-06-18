import { requestJson } from "./http";
import type { AuthState, ClientModel } from "./types";

export async function listModels(baseUrl: string, auth: AuthState): Promise<ClientModel[]> {
  const payload = await requestJson<{ data: ClientModel[] }>(baseUrl, "/v1/models", {}, auth);
  return payload.data;
}
