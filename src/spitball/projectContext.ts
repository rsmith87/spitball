import { requestJson } from "./http";
import type { AuthState, ProjectContextRequest, ProjectContextResponse } from "./types";

export function summarizeProject(baseUrl: string, auth: AuthState, request: ProjectContextRequest): Promise<ProjectContextResponse> {
  return requestJson<ProjectContextResponse>(
    baseUrl,
    "/v1/client/project-context/summarize_project",
    { method: "POST", body: JSON.stringify(request) },
    auth,
  );
}

export function summarizePath(baseUrl: string, auth: AuthState, request: ProjectContextRequest): Promise<ProjectContextResponse> {
  return requestJson<ProjectContextResponse>(
    baseUrl,
    "/v1/client/project-context/summarize_path",
    { method: "POST", body: JSON.stringify(request) },
    auth,
  );
}

export function refreshContextItem(baseUrl: string, auth: AuthState, request: ProjectContextRequest): Promise<ProjectContextResponse> {
  return requestJson<ProjectContextResponse>(
    baseUrl,
    "/v1/client/project-context/refresh_context_item",
    { method: "POST", body: JSON.stringify(request) },
    auth,
  );
}
