// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getContextBudget, sendChat, streamChat } from "../spitball/chat";
import { runChatDiagnostics } from "../spitball/diagnostics";
import { summarizePath } from "../spitball/projectContext";

const savedProfile = {
  id: "default",
  name: "Controller backend",
  backendUrl: "https://pi-controller.local",
  backendMode: "controller",
  authMode: "external_api_key",
  apiKey: "nxa_saved_key",
  defaultModel: "gemma-4-E4B-it",
  requestType: "chat",
};

const saveProfile = vi.fn();

vi.mock("../storage/indexedDbStorage", () => ({
  getProfile: vi.fn(async () => savedProfile),
  listConversations: vi.fn(async () => []),
  saveConversation: vi.fn(async () => "chat-1"),
  saveProfile: (...args: unknown[]) => saveProfile(...args),
}));

vi.mock("../spitball/discovery", () => ({
  getClientDiscovery: vi.fn(async () => ({
    product: "spitball",
    version: "test",
    mode: "controller",
    capabilities: { openaiChatCompletions: true, streaming: true, localChatSessions: false, projectContext: true, businessPlugin: false },
    auth: { methods: ["external_api_key"], sessionHeader: "X-UI-Session", apiKeyHeader: "X-Llama-Manager-Key" },
    endpoints: {},
  })),
}));

vi.mock("../spitball/session", () => ({
  getClientSession: vi.fn(async () => ({
    auth: { method: "external_key", role: "external", username: "Home App" },
    capabilities: { openaiChatCompletions: true, streaming: true, serverHistory: false, projectContext: true },
    projectContext: {
      actions: ["summarize_project", "summarize_path", "refresh_context_item"],
      endpoint: "/v1/client/project-context/{action}",
      inputPolicy: "explicit_user_selected_inputs_and_saved_artifact_metadata_only",
    },
    models: [
      {
        id: "gemma-4-E4B-it",
        object: "model",
        owned_by: "spitball",
        metadata: {
          display_label: "Gemma",
          request_types: ["chat"],
          default_request_type: "chat",
          context_identity: "gemma-4-E4B-it",
          model_family: "gemma-4-E4B-it",
          context_profile: null,
          capabilities: { streaming: true, json_schema: false, grammar: false, vision: false },
        },
      },
      {
        id: "qwen-coder",
        object: "model",
        owned_by: "spitball",
        metadata: {
          display_label: "Qwen Coder",
          request_types: ["chat"],
          default_request_type: "chat",
          context_identity: "qwen-coder",
          model_family: "qwen-coder",
          context_profile: null,
          capabilities: { streaming: false, json_schema: false, grammar: false, vision: false },
        },
      },
    ],
  })),
}));

vi.mock("../spitball/models", () => ({
  listModels: vi.fn(async () => []),
}));

vi.mock("../spitball/diagnostics", () => ({
  runChatDiagnostics: vi.fn(async () => ({
    ok: true,
    checks: { auth: true, modelUsable: true, routeResolved: true, chat: true, streaming: true },
    route: { node: "mac-mini", model: "gemma-4-E4B-it", route: "node:mac-mini" },
    error: null,
  })),
}));

vi.mock("../spitball/chat", () => ({
  getContextBudget: vi.fn(async () => ({
    model: "gemma-4-E4B-it",
    context_window_tokens: 32768,
    prompt_tokens_estimated: 14000,
    reserved_completion_tokens: 512,
    available_input_tokens: 32256,
    remaining_context_tokens: 18256,
    usage_ratio: 0.442,
    status: "comfortable",
    estimation_method: "approx_chars_div_4",
    precision: "approximate",
    warnings: [],
  })),
  sendChat: vi.fn(async () => "assistant ok"),
  streamChat: vi.fn(),
}));

vi.mock("../spitball/projectContext", () => ({
  summarizePath: vi.fn(async () => ({
    action: "summarize_path",
    policy: "explicit_user_selected_inputs_and_saved_artifact_metadata_only",
    summary: {
      project: { name: "Spitball", root: null },
      path: { path: "packages/spitball/README.md", characters: 12 },
      artifacts: [],
    },
  })),
}));

describe("App setup profile", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    saveProfile.mockClear();
    vi.mocked(sendChat).mockClear();
    vi.mocked(streamChat).mockClear();
    vi.mocked(getContextBudget).mockClear();
    vi.mocked(runChatDiagnostics).mockClear();
    vi.mocked(summarizePath).mockClear();
  });

  it("restores a remembered backend URL and app key", async () => {
    render(<App />);

    expect(await screen.findByDisplayValue("https://pi-controller.local")).not.toBeNull();
    expect(await screen.findByDisplayValue("nxa_saved_key")).not.toBeNull();
  });

  it("saves the app key only when remember key is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByLabelText("Remember key on this device")).toHaveProperty("checked", true);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ apiKey: "nxa_saved_key" });
  });

  it("keeps the selected model when testing the connection again", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getAllByRole("combobox")[0], "qwen-coder");
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
    expect(saveProfile.mock.calls[1][0]).toMatchObject({ defaultModel: "qwen-coder" });
    expect(vi.mocked(runChatDiagnostics).mock.calls[1][2]).toMatchObject({ model: "qwen-coder" });
    expect(screen.getByDisplayValue("Qwen Coder")).not.toBeNull();
  });

  it("sends with Enter and keeps Shift Enter as a newline", async () => {
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect((composer as HTMLTextAreaElement).value).toBe("line one\n");

    await user.type(composer, "line two");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("assistant ok")).not.toBeNull());
  });

  it("shows the current context budget above the composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "budget this");

    await waitFor(() => expect(screen.getByTestId("spitball-context-budget").textContent).toContain("Context: 14.5k / 32.8k used"));
    expect(screen.getByTestId("spitball-context-budget").textContent).toContain("18.3k left");
    expect(getContextBudget).toHaveBeenCalled();
  });

  it("shows context pressure styling and warning near the limit", async () => {
    vi.mocked(getContextBudget).mockResolvedValueOnce({
      model: "gemma-4-E4B-it",
      context_window_tokens: 32768,
      prompt_tokens_estimated: 28500,
      reserved_completion_tokens: 1024,
      available_input_tokens: 31744,
      remaining_context_tokens: 3244,
      usage_ratio: 0.901,
      status: "near_limit",
      estimation_method: "approx_chars_div_4",
      precision: "approximate",
      warnings: [],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "large context");

    const budget = await screen.findByTestId("spitball-context-budget");
    expect(budget.textContent).toContain("Near limit. Shorten older messages or start a new conversation.");
    expect(budget.closest(".chat-panel")?.className).toContain("context-pressure-near_limit");
  });

  it("sends agent tool runtime when agent tools are enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "check workspace");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    expect(vi.mocked(sendChat).mock.calls[0][2]).toMatchObject({ tool_runtime: "agent" });
  });

  it("uses non-streaming chat when agent tools are enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "use a tool");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    expect(streamChat).not.toHaveBeenCalled();
    expect(vi.mocked(sendChat).mock.calls[0][2]).toMatchObject({ stream: false, tool_runtime: "agent" });
  });

  it("collapses the setup pane into a reopen rail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText("Collapse setup pane"));

    expect(screen.queryByText("Backend URL")).toBeNull();
    expect(screen.getByLabelText("Open setup pane")).not.toBeNull();

    await user.click(screen.getByLabelText("Open setup pane"));

    expect(screen.getByText("Backend URL")).not.toBeNull();
  });

  it("summarizes explicit project context into the composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Project path"), "packages/spitball/README.md");
    await user.type(screen.getByLabelText("Selected content"), "# Spitball");
    await user.click(screen.getByRole("button", { name: /summarize context/i }));

    await waitFor(() => expect(summarizePath).toHaveBeenCalled());
    expect(vi.mocked(summarizePath).mock.calls[0][2]).toMatchObject({
      selected_paths: [{ path: "packages/spitball/README.md", content: "# Spitball" }],
      focused_path: "packages/spitball/README.md",
    });
    expect((screen.getByPlaceholderText("Send a message to your private backend") as HTMLTextAreaElement).value).toBe(
      "Project context from packages/spitball/README.md: 12 characters selected.",
    );
  });

  it("places project context in the left sidebar", () => {
    const { container } = render(<App />);

    const sidebar = container.querySelector(".sidebar");

    expect(sidebar?.textContent).toContain("Project context");
    expect(sidebar?.textContent?.indexOf("Project context")).toBeLessThan(sidebar?.textContent?.indexOf("Browser history uses IndexedDB") ?? -1);
  });
});
