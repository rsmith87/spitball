import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackendProject, listBackendProjects } from "./projects";

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
});
