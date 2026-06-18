import { requestJson } from "./http";
import type { ClientDiscovery } from "./types";

export function getClientDiscovery(baseUrl: string): Promise<ClientDiscovery> {
  return requestJson<ClientDiscovery>(baseUrl, "/lm-api/v1/client-discovery");
}
