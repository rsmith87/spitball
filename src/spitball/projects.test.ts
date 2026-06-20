import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackendProject, listBackendProjects, updateBackendProject, upsertBackendProjectNodeRoot } from "./projects";

describe("projects client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists controller-owned projects through llama-pack", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          projects: [
            {
              id: "project-1",
              name: "Spitball",
              root_hint: "/Users/robertsmith/Apps/llama-pack",
              created_at: "2026-06-18T12:00:00Z",
              updated_at: "2026-06-18T12:01:00Z",
              archived: false,
            },
          ],
        }),
        { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const projects = await listBackendProjects("http://controller.local", { mode: "external_api_key", apiKey: "key" });

    expect(projects).toEqual([
      {
        id: "project-1",
        name: "Spitball",
        root: "/Users/robertsmith/Apps/llama-pack",
        createdAt: "2026-06-18T12:00:00Z",
        updatedAt: "2026-06-18T12:01:00Z",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://controller.local/v1/client/projects",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Llama-Pack-Key": "key" }) }),
    );
  });

  it("creates a controller-owned project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: "project-2",
          name: "Llama Pack",
          root_hint: "/repo",
          created_at: "2026-06-18T12:00:00Z",
          updated_at: "2026-06-18T12:00:00Z",
          archived: false,
        }),
        { status: 201, statusText: "Created", headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const project = await createBackendProject(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      { name: "Llama Pack", root: "/repo" },
    );

    expect(project.id).toBe("project-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://controller.local/v1/client/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Llama Pack", root_hint: "/repo" }),
        headers: expect.objectContaining({ "X-Llama-Pack-Key": "key" }),
      }),
    );
  });

  it("updates a controller-owned project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: "project-2",
          name: "Renamed",
          root_hint: "/workspace",
          created_at: "2026-06-18T12:00:00Z",
          updated_at: "2026-06-18T12:02:00Z",
          archived: false,
        }),
        { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const project = await updateBackendProject(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      { id: "project-2", name: "Renamed", root: "/workspace" },
    );

    expect(project.name).toBe("Renamed");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://controller.local/v1/client/projects/project-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed", root_hint: "/workspace", archived: false }),
        headers: expect.objectContaining({ "X-Llama-Pack-Key": "key" }),
      }),
    );
  });

  it("upserts a project node root with safe root status", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: "root-1",
          project_id: "project-2",
          node_name: "mac-mini",
          root_path: "/workspace",
          safe_root_status: "allowed",
          created_at: "2026-06-18T12:00:00Z",
          updated_at: "2026-06-18T12:02:00Z",
        }),
        { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const root = await upsertBackendProjectNodeRoot(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      { projectId: "project-2", nodeName: "mac-mini", rootPath: "/workspace", safeRootStatus: "allowed" },
    );

    expect(root.safeRootStatus).toBe("allowed");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://controller.local/v1/client/projects/project-2/node-roots",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ node_name: "mac-mini", root_path: "/workspace", safe_root_status: "allowed" }),
        headers: expect.objectContaining({ "X-Llama-Pack-Key": "key" }),
      }),
    );
  });
});
