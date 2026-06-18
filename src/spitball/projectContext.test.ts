import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizePath } from "./projectContext";

describe("project context client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts explicit selected content to the summarize_path action", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          action: "summarize_path",
          policy: "explicit_user_selected_inputs_and_saved_artifact_metadata_only",
          summary: {
            project: { name: "Spitball", root: null },
            path: { path: "packages/spitball/README.md", characters: 12 },
            artifacts: [],
          },
        }),
        { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await summarizePath(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        project: { name: "Spitball", root: null },
        selected_paths: [{ path: "packages/spitball/README.md", content: "# Spitball\n\n" }],
        artifacts: [],
        focused_path: "packages/spitball/README.md",
      },
    );

    expect(response.action).toBe("summarize_path");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://controller.local/v1/client/project-context/summarize_path",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project: { name: "Spitball", root: null },
          selected_paths: [{ path: "packages/spitball/README.md", content: "# Spitball\n\n" }],
          artifacts: [],
          focused_path: "packages/spitball/README.md",
        }),
        headers: expect.objectContaining({ "X-Llama-Manager-Key": "key" }),
      }),
    );
  });
});
