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

export type ProjectNodeRootSafeStatus = "unknown" | "allowed" | "blocked";

export type ProjectNodeRoot = {
  id: string;
  projectId: string;
  nodeName: string;
  rootPath: string;
  safeRootStatus: ProjectNodeRootSafeStatus;
  createdAt: string;
  updatedAt: string;
};

type BackendProjectNodeRoot = {
  id: string;
  project_id: string;
  node_name: string;
  root_path: string;
  safe_root_status: ProjectNodeRootSafeStatus;
  created_at: string;
  updated_at: string;
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

export async function updateBackendProject(baseUrl: string, auth: AuthState, project: Pick<Project, "id" | "name" | "root">): Promise<Project> {
  const payload = await requestJson<BackendProject>(
    baseUrl,
    `/v1/client/projects/${encodeURIComponent(project.id)}`,
    { method: "PATCH", body: JSON.stringify({ name: project.name, root_hint: project.root || null, archived: false }) },
    auth,
  );
  return projectFromBackend(payload);
}

export async function upsertBackendProjectNodeRoot(
  baseUrl: string,
  auth: AuthState,
  root: { projectId: string; nodeName: string; rootPath: string; safeRootStatus: ProjectNodeRootSafeStatus },
): Promise<ProjectNodeRoot> {
  const payload = await requestJson<BackendProjectNodeRoot>(
    baseUrl,
    `/v1/client/projects/${encodeURIComponent(root.projectId)}/node-roots`,
    {
      method: "PUT",
      body: JSON.stringify({ node_name: root.nodeName, root_path: root.rootPath, safe_root_status: root.safeRootStatus }),
    },
    auth,
  );
  return nodeRootFromBackend(payload);
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

function nodeRootFromBackend(root: BackendProjectNodeRoot): ProjectNodeRoot {
  return {
    id: root.id,
    projectId: root.project_id,
    nodeName: root.node_name,
    rootPath: root.root_path,
    safeRootStatus: root.safe_root_status,
    createdAt: root.created_at,
    updatedAt: root.updated_at,
  };
}
