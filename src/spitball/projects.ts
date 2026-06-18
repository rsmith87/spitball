import { requestJson } from "./http";
import type { AuthState } from "./types";
import type { Project } from "../storage/types";

type BackendProject = {
  id: string;
  name: string;
  root_hint: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
};

type BackendProjectList = {
  projects: BackendProject[];
};

export async function listBackendProjects(baseUrl: string, auth: AuthState): Promise<Project[]> {
  const payload = await requestJson<BackendProjectList>(baseUrl, "/v1/client/projects", {}, auth);
  return payload.projects.map(projectFromBackend);
}

export async function createBackendProject(baseUrl: string, auth: AuthState, project: Pick<Project, "name" | "root">): Promise<Project> {
  const payload = await requestJson<BackendProject>(
    baseUrl,
    "/v1/client/projects",
    { method: "POST", body: JSON.stringify({ name: project.name, root_hint: project.root || null }) },
    auth,
  );
  return projectFromBackend(payload);
}

function projectFromBackend(project: BackendProject): Project {
  return {
    id: project.id,
    name: project.name,
    root: project.root_hint || "",
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}
