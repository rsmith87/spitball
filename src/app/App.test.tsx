// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { compactThread, getContextBudget, sendChat, stopGeneration, streamChat } from "../spitball/chat";
import { runChatDiagnostics } from "../spitball/diagnostics";
import { getClientSession } from "../spitball/session";
import { getProfile } from "../storage";
import type { Conversation, TaxonomyItem } from "../storage/types";

const savedProfile = {
  id: "default",
  name: "Controller backend",
  backendUrl: "https://pi-controller.local",
  backendMode: "controller",
  authMode: "external_api_key" as const,
  apiKey: "nxa_saved_key",
  defaultModel: "gemma-4-E4B-it",
  requestType: "chat",
};

const saveProfile = vi.fn();
const saveProject = vi.fn();
const saveConversation = vi.fn();
const saveTaxonomyItem = vi.fn();
const deleteTaxonomyItem = vi.fn();
const deleteConversation = vi.fn();
let storedConversations: Conversation[] = [];
let storedTaxonomyItems: TaxonomyItem[] = [];
const storedProjects = [
  {
    id: "project-llama-pack",
    name: "Llama Pack",
    root: "/Users/robertsmith/Apps/llama-pack",
    createdAt: "2026-06-18T10:00:00.000Z",
    updatedAt: "2026-06-18T10:00:00.000Z",
  },
];

vi.mock("../storage", () => ({
  getProfile: vi.fn(async () => savedProfile),
  listConversations: vi.fn(async () => storedConversations),
  listProjects: vi.fn(async () => storedProjects),
  listTaxonomyItems: vi.fn(async () => storedTaxonomyItems),
  saveConversation: (...args: unknown[]) => saveConversation(...args),
  deleteConversation: (...args: unknown[]) => deleteConversation(...args),
  saveProfile: (...args: unknown[]) => saveProfile(...args),
  saveProject: (...args: unknown[]) => saveProject(...args),
  saveTaxonomyItem: (...args: unknown[]) => saveTaxonomyItem(...args),
  deleteTaxonomyItem: (...args: unknown[]) => deleteTaxonomyItem(...args),
}));

vi.mock("../spitball/discovery", () => ({
  getClientDiscovery: vi.fn(async () => ({
    product: "spitball",
    version: "test",
    mode: "controller",
    capabilities: { openaiChatCompletions: true, streaming: true, localChatSessions: false, projectContext: true, businessPlugin: false },
    auth: { methods: ["external_api_key"], sessionHeader: "X-UI-Session", apiKeyHeader: "X-Llama-Pack-Key" },
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
  compactThread: vi.fn(async () => ({
    summarized: true,
    summaryEventId: "summary-1",
    summary: "Older context summary",
    promptTokensBefore: 4000,
    promptTokensAfter: 900,
    coveredEventCount: 6,
  })),
  sendChat: vi.fn(async () => ({ content: "assistant ok" })),
  stopGeneration: vi.fn(async () => undefined),
  streamChat: vi.fn(async (_baseUrl, _auth, _request, onToken) => {
    onToken({ content: "assistant ok" });
  }),
}));

describe("App setup profile", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    saveProfile.mockClear();
    saveProject.mockClear();
    saveConversation.mockClear();
    saveTaxonomyItem.mockClear();
    deleteTaxonomyItem.mockClear();
    deleteConversation.mockClear();
    storedConversations = [];
    storedTaxonomyItems = [];
    vi.mocked(sendChat).mockClear();
    vi.mocked(stopGeneration).mockClear();
    vi.mocked(streamChat).mockClear();
    vi.mocked(streamChat).mockImplementation(async (_baseUrl, _auth, _request, onToken) => {
      onToken({ content: "assistant ok" });
    });
    vi.mocked(getContextBudget).mockClear();
    vi.mocked(compactThread).mockClear();
    vi.mocked(runChatDiagnostics).mockClear();
  });

  async function openSettings(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Settings" }));
  }

  function checkRow(label: string): Element {
    const row = screen.getByText(label).closest(".check-row");
    if (!row) throw new Error(`Expected ${label} check row to exist.`);
    return row;
  }

  it("restores a remembered backend URL and app key", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    expect(await screen.findByDisplayValue("https://pi-controller.local")).not.toBeNull();
    expect(await screen.findByDisplayValue("nxa_saved_key")).not.toBeNull();
  });

  it("hydrates a validated saved connection as ready", async () => {
    vi.mocked(getProfile).mockResolvedValueOnce({
      ...savedProfile,
      validatedAt: "2026-06-18T10:00:00.000Z",
      cachedModels: [
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
      ],
    });
    render(<App />);

    expect(await screen.findByText("Connection ready")).not.toBeNull();
    await waitFor(() => expect(getContextBudget).toHaveBeenCalled());
  });

  it("saves the app key only when remember key is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    expect(await screen.findByLabelText("Remember key on this device")).toHaveProperty("checked", true);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ apiKey: "nxa_saved_key", validatedAt: expect.any(String) });
  });

  it("defaults and saves the max output token setting", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    const input = await screen.findByLabelText("Max output tokens");
    expect(input).toHaveProperty("value", "1024");
    await user.clear(input);
    await user.type(input, "4096");
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ maxTokens: 4096 });
  });

  it("defaults and saves the agent tool max iteration setting", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    const input = await screen.findByLabelText("Agent tool max iterations");
    expect(input).toHaveProperty("value", "12");
    await user.clear(input);
    await user.type(input, "24");
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ agentToolMaxIterations: 24 });
  });

  it("keeps the selected model when testing the connection again", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "New conversation" }));
    await user.selectOptions(screen.getAllByRole("combobox")[0], "qwen-coder");
    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
    expect(saveProfile.mock.calls[1][0]).toMatchObject({ defaultModel: "qwen-coder" });
    expect(runChatDiagnostics).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    expect(screen.getByDisplayValue("Qwen Coder")).not.toBeNull();
  });

  it("tests backend connectivity without running a model diagnostic or replacing a stale selected model", async () => {
    vi.mocked(getProfile).mockResolvedValueOnce({
      ...savedProfile,
      defaultModel: "already-running-model",
      cachedModels: [
        {
          id: "already-running-model",
          object: "model",
          owned_by: "spitball",
          metadata: {
            display_label: "Already Running",
            request_types: ["chat"],
            default_request_type: "chat",
            context_identity: "already-running-model",
            model_family: "already-running-model",
            context_profile: null,
            capabilities: { streaming: true, json_schema: false, grammar: false, vision: false },
          },
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(runChatDiagnostics).not.toHaveBeenCalled();
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ defaultModel: "already-running-model" });
  });

  it("marks model usable from the authenticated model list without running chat diagnostics", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(runChatDiagnostics).not.toHaveBeenCalled();
    expect(checkRow("Model usable").className).toContain("pass");
    expect(checkRow("Route resolved").className).toContain("pending");
    expect(checkRow("Chat diagnostic").className).toContain("pending");
    expect(checkRow("Streaming").className).toContain("pending");
  });

  it("runs runtime model diagnostics separately from test connection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /run model diagnostic/i }));

    await waitFor(() => expect(runChatDiagnostics).toHaveBeenCalledWith(
      "https://pi-controller.local",
      { mode: "external_api_key", apiKey: "nxa_saved_key" },
      { model: "gemma-4-E4B-it", request_type: "chat", stream: true },
    ));
    expect(checkRow("Route resolved").className).toContain("pass");
    expect(checkRow("Chat diagnostic").className).toContain("pass");
    expect(checkRow("Streaming").className).toContain("pass");
  });

  it("marks model usable as failed when the authenticated backend returns no models", async () => {
    vi.mocked(getClientSession).mockResolvedValueOnce({
      auth: { method: "external_key", role: "external", username: "Home App" },
      capabilities: { openaiChatCompletions: true, streaming: true, serverHistory: false, projectContext: true },
      models: [],
    });
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(checkRow("Model usable").className).toContain("fail");
  });

  it("starts a blank chat when creating a new conversation from existing history", async () => {
    storedConversations = [
      {
        id: "chat-existing",
        title: "Existing chat",
        model: "gemma-4-E4B-it",
        requestType: "chat",
        threadId: "thread-existing",
        messages: [
          { role: "user", content: "old prompt" },
          { role: "assistant", content: "old reply" },
        ],
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Existing chat" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "New conversation" }));

    expect(screen.getByRole("heading", { name: "New private chat" })).not.toBeNull();
    expect(screen.queryByText("old prompt")).toBeNull();
  });

  it("adds, edits, and deletes chat buckets in the taxonomy manager", async () => {
    storedTaxonomyItems = [
      {
        id: "bucket-work",
        name: "Work",
        createdAt: "2026-06-18T10:00:00.000Z",
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    render(<App />);

    const bucketName = await screen.findByLabelText("Bucket name");
    await user.type(bucketName, "Research");
    await user.click(screen.getByRole("button", { name: "Add bucket" }));

    expect(saveTaxonomyItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Research" }));
    expect(await screen.findByText("Research")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Work" }));
    const editingName = screen.getByLabelText("Editing bucket name");
    await user.clear(editingName);
    await user.type(editingName, "Client work");
    await user.click(screen.getByRole("button", { name: "Save bucket" }));

    expect(saveTaxonomyItem).toHaveBeenCalledWith(expect.objectContaining({ id: "bucket-work", name: "Client work" }));
    expect(await screen.findByText("Client work")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete Client work" }));

    expect(deleteTaxonomyItem).toHaveBeenCalledWith("bucket-work");
    expect(screen.queryByText("Client work")).toBeNull();
  });

  it("renames, buckets, and deletes conversations from the history context menu", async () => {
    storedTaxonomyItems = [
      {
        id: "bucket-work",
        name: "Work",
        createdAt: "2026-06-18T10:00:00.000Z",
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    storedConversations = [
      {
        id: "chat-existing",
        title: "Existing chat",
        model: "gemma-4-E4B-it",
        requestType: "chat",
        messages: [{ role: "user", content: "old prompt" }],
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    render(<App />);

    const conversation = await screen.findByRole("button", { name: /Existing chat/ });
    fireEvent.contextMenu(conversation, { clientX: 24, clientY: 48 });

    expect(screen.getByRole("menu", { name: "Conversation context menu" })).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Edit title" }));
    const titleInput = screen.getByLabelText("Conversation title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed chat");
    await user.click(screen.getByRole("button", { name: "Save title" }));

    expect(saveConversation).toHaveBeenCalledWith(expect.objectContaining({ id: "chat-existing", title: "Renamed chat" }));
    expect(screen.getByRole("button", { name: /Renamed chat/ })).not.toBeNull();

    fireEvent.contextMenu(screen.getByRole("button", { name: /Renamed chat/ }), { clientX: 24, clientY: 48 });
    await user.click(screen.getByRole("menuitem", { name: "Work" }));

    expect(saveConversation).toHaveBeenCalledWith(expect.objectContaining({ id: "chat-existing", taxonomyItemId: "bucket-work" }));
    expect(await screen.findByText("Bucket: Work")).not.toBeNull();

    fireEvent.contextMenu(screen.getByRole("button", { name: /Renamed chat/ }), { clientX: 24, clientY: 48 });
    await user.click(screen.getByRole("menuitem", { name: "Delete conversation" }));

    expect(deleteConversation).toHaveBeenCalledWith("chat-existing");
    expect(screen.queryByText("Renamed chat")).toBeNull();
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

  it("changes the send button to stop while generation is running", async () => {
    let resolveStream: () => void = () => undefined;
    vi.mocked(streamChat).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
    });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "stop this");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const stopButton = await screen.findByRole("button", { name: "Stop generation" });
    await user.click(stopButton);

    expect(stopGeneration).toHaveBeenCalledWith("https://pi-controller.local", { mode: "external_api_key", apiKey: "nxa_saved_key" }, "gemma-4-E4B-it", 0, "auto");
    resolveStream();
  });

  it("shows clipboard actions from the composer right click menu", async () => {
    const user = userEvent.setup();
    const clipboard = {
      readText: vi.fn(async () => " pasted"),
      writeText: vi.fn(async () => undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend") as HTMLTextAreaElement;
    await user.clear(composer);
    await user.type(composer, "copy me");
    composer.setSelectionRange(0, 4);
    fireEvent.contextMenu(composer, { clientX: 24, clientY: 48 });

    expect(screen.getByRole("menu", { name: "Composer context menu" })).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(clipboard.writeText).toHaveBeenCalledWith("copy");

    composer.setSelectionRange(composer.value.length, composer.value.length);
    fireEvent.contextMenu(composer, { clientX: 24, clientY: 48 });
    await user.click(screen.getByRole("menuitem", { name: "Paste" }));

    expect(composer.value).toBe("copy me pasted");
    expect(clipboard.readText).toHaveBeenCalled();
  });

  it("copies a whole chat message from the message right click menu", async () => {
    storedConversations = [
      {
        id: "chat-existing",
        title: "Existing chat",
        model: "gemma-4-E4B-it",
        requestType: "chat",
        messages: [{ role: "user", content: "copy this whole prompt" }],
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    const clipboard = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    render(<App />);

    const message = await screen.findByText("copy this whole prompt");
    fireEvent.contextMenu(message.closest("article") as HTMLElement, { clientX: 24, clientY: 48 });

    expect(screen.getByRole("menu", { name: "Message context menu" })).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Copy message" }));

    expect(clipboard.writeText).toHaveBeenCalledWith("copy this whole prompt");
  });

  it("copies assistant markdown code from the code block right click menu", async () => {
    storedConversations = [
      {
        id: "chat-existing",
        title: "Existing chat",
        model: "gemma-4-E4B-it",
        requestType: "chat",
        messages: [{ role: "assistant", content: "```ts\nconst value = 1;\n```" }],
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    const clipboard = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    render(<App />);

    let code: HTMLElement | null = null;
    await waitFor(() => {
      const codeElement = document.querySelector(".message-markdown code");
      code = codeElement instanceof HTMLElement ? codeElement : null;
      expect(code).not.toBeNull();
    });
    if (!code) throw new Error("Expected rendered code block.");
    fireEvent.contextMenu(code, { clientX: 24, clientY: 48 });

    expect(screen.getByRole("menu", { name: "Code block context menu" })).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Copy code" }));

    expect(clipboard.writeText).toHaveBeenCalledWith("const value = 1;");
  });

  it("streams regular chat requests", async () => {
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "stream this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(streamChat).toHaveBeenCalled());
    expect(sendChat).not.toHaveBeenCalled();
    expect(vi.mocked(streamChat).mock.calls[0][2]).toMatchObject({ stream: true, max_tokens: 1024 });
  });

  it("renders assistant markdown in streamed responses", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({ content: "## Summary\n\n- alpha item\n\n| File | Role |\n| --- | --- |\n| runner.py | core |\n\n```ts\nconst value = 1;\n```" });
    });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "markdown please");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: "Summary" })).not.toBeNull();
    expect(screen.getByRole("listitem").textContent).toContain("alpha item");
    expect(screen.getByRole("columnheader", { name: "File" })).not.toBeNull();
    expect(document.querySelector(".message-markdown code")?.textContent).toContain("const value = 1;");
    expect(document.querySelector(".message-markdown code .hljs-keyword")?.textContent).toBe("const");
  });

  it("sends the Llama Pack thread id on later turns", async () => {
    const user = userEvent.setup();
    vi.mocked(streamChat)
      .mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
        onToken({ content: "", threadId: "thread-abc" });
        onToken({ content: "first reply" });
      })
      .mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
        onToken({ content: "second reply" });
      });
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "first");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("first reply")).not.toBeNull());

    await user.clear(composer);
    await user.type(composer, "continue");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2));

    expect(vi.mocked(streamChat).mock.calls[1][2]).toMatchObject({ thread_id: "thread-abc" });
    expect(vi.mocked(streamChat).mock.calls[1][2].messages).toEqual([{ role: "user", content: "continue" }]);
  });

  it("shows a pending assistant indicator before the first streamed token", async () => {
    let finishStream: (() => void) | undefined;
    vi.mocked(streamChat).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishStream = resolve;
      });
    });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "take your time");
    await user.keyboard("{Enter}");

    expect(await screen.findByTestId("spitball-assistant-pending")).not.toBeNull();
    finishStream?.();
  });

  it("shows analytics chips for assistant responses", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({
        content: "assistant measured",
        telemetry: {
          promptTokens: 42,
          completionTokens: 10,
          promptMs: 55,
          completionMs: 500,
          tokensPerSecond: 20,
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "measure this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("assistant measured")).not.toBeNull());
    expect(screen.getByText("tok/s: 20.00")).not.toBeNull();
    expect(screen.getByText("prompt_toks: 42")).not.toBeNull();
    expect(screen.getByText("gen_toks: 10")).not.toBeNull();
  });

  it("shows the current context budget above the composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "budget this");

    await waitFor(() => expect(screen.getByTestId("spitball-context-budget").textContent).toContain("Context: 14.5k / 32.8k used"));
    expect(screen.getByTestId("spitball-context-budget").textContent).toContain("18.3k left");
    expect(screen.getByTestId("spitball-context-budget").textContent).toContain("44%");
    expect(screen.getByTestId("spitball-context-budget").textContent).toContain("Prompt 14.0k");
    expect(screen.getByTestId("spitball-context-budget").textContent).toContain("Reserved output 512");
    expect(screen.getByRole("progressbar", { name: "Context used" }).getAttribute("aria-valuenow")).toBe("44");
    expect(getContextBudget).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      1024,
    );
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

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "large context");

    const budget = await screen.findByTestId("spitball-context-budget");
    expect(budget.textContent).toContain("Near limit. Shorten older messages or start a new conversation.");
    expect(budget.closest(".chat-panel")?.className).toContain("context-pressure-near_limit");
  });

  it("manually compacts backend thread context from the budget panel", async () => {
    vi.mocked(getProfile).mockResolvedValueOnce({
      ...savedProfile,
      validatedAt: "2026-06-18T10:00:00.000Z",
      cachedModels: [
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
      ],
    });
    storedConversations = [
      {
        id: "chat-existing",
        title: "Existing chat",
        model: "gemma-4-E4B-it",
        requestType: "chat",
        threadId: "thread-existing",
        messages: [
          { role: "user", content: "old prompt" },
          { role: "assistant", content: "old reply" },
        ],
        updatedAt: "2026-06-18T10:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("spitball-context-budget");
    await user.click(screen.getByRole("button", { name: "Compact context" }));

    await waitFor(() => expect(compactThread).toHaveBeenCalledWith(
      "https://pi-controller.local",
      { mode: "external_api_key", apiKey: "nxa_saved_key" },
      {
        threadId: "thread-existing",
        model: "gemma-4-E4B-it",
        target: "auto",
        recentMessageCount: 4,
      },
    ));
    expect(saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      id: "chat-existing",
      threadId: "thread-existing",
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: "Context compacted.",
          contextManagement: expect.objectContaining({ summaryEventId: "summary-1" }),
        }),
      ]),
    }));
    expect(await screen.findByText("Context compacted.")).not.toBeNull();
    expect(screen.getByText("context summarized")).not.toBeNull();
  });

  it("sends agent tool runtime when agent tools are enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "check workspace");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(streamChat).toHaveBeenCalled());
    expect(vi.mocked(streamChat).mock.calls[0][2]).toMatchObject({ tool_runtime: "agent" });
  });

  it("streams chat when agent tools are enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "use a tool");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(streamChat).toHaveBeenCalled());
    expect(sendChat).not.toHaveBeenCalled();
    expect(vi.mocked(streamChat).mock.calls[0][2]).toMatchObject({
      stream: true,
      tool_runtime: "agent",
      max_tokens: 1024,
      agent_tool_max_iterations: 12,
    });
  });

  it("renders streamed agent tool progress pills", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({ content: "", progress: { id: "assistant-generating", type: "status", status: "running", label: "Generating" } });
      onToken({
        content: "",
        progress: {
          id: "evt-2",
          type: "tool",
          status: "running",
          label: "read_project_file",
          toolName: "read_project_file",
          target: "runner.py",
          detail: "L40-L88",
        },
      });
      onToken({
        content: "",
        progress: {
          id: "evt-2",
          type: "tool",
          status: "passed",
          label: "read_project_file",
          toolName: "read_project_file",
          target: "runner.py",
          detail: "L40-L88",
        },
      });
      onToken({ content: "", progress: { id: "evt-3", type: "status", status: "running", label: "Reviewing generation" } });
      onToken({ content: "assistant verified" });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "verify this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("assistant verified")).not.toBeNull());
    expect(screen.getByText("Generated")).not.toBeNull();
    expect(screen.queryByText("Generating")).toBeNull();
    expect(screen.getByText("read_project_file L40-L88")).not.toBeNull();
    expect(screen.getByText("runner.py")).not.toBeNull();
    expect(screen.getByText("Reviewing generation")).not.toBeNull();
    expect(document.querySelector('.agent-progress-pill[data-status="running"]')?.textContent).not.toContain("Generated");
  });

  it("renders verification warnings and issue details for streamed assistant answers", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({
        content: "",
        progress: {
          id: "answer-reviewing",
          type: "status",
          status: "failed",
          label: "Needs verification",
          verification: {
            status: "failed",
            issues: [
              {
                kind: "missing_path",
                value: "src/fake.py",
                start: 5,
                end: 16,
                excerpt: "`src/fake.py`",
                severity: "failed",
              },
            ],
          },
        },
      });
      onToken({ content: "Use `src/fake.py`." });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "verify this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getAllByText("Needs verification").length).toBeGreaterThan(0));
    expect(screen.getByText("Unverified claim")).not.toBeNull();
    expect(screen.getByText("Path not found in project graph")).not.toBeNull();
    expect(screen.getAllByText("src/fake.py").length).toBeGreaterThan(0);
    expect(document.querySelector(".verification-inline-issue")?.textContent).toBe("src/fake.py");
  });

  it("renders verification warnings from final streamed assistant metadata", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({
        content: "Use `src/fake.py`.",
        verification: {
          status: "unverified",
          issues: [
            {
              kind: "missing_path",
              value: "src/fake.py",
              start: 5,
              end: 16,
              excerpt: "`src/fake.py`",
              severity: "failed",
            },
          ],
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "verify this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("Needs verification")).not.toBeNull());
    expect(screen.getByText("Path not found in project graph")).not.toBeNull();
    expect(document.querySelector(".verification-inline-issue")?.textContent).toBe("src/fake.py");
  });

  it("renders a verified badge from final streamed assistant metadata", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({
        content: "The claim is backed by source reads.",
        verification: {
          status: "verified",
          issues: [],
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "verify this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("Verified")).not.toBeNull());
    expect(document.querySelector('.verification-status[data-status="verified"]')).not.toBeNull();
    expect(screen.queryByText("Unverified claim")).toBeNull();
  });

  it("renders a no code claims badge from final streamed assistant metadata", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async (_baseUrl, _auth, _request, onToken) => {
      onToken({
        content: "This answer does not make code graph claims.",
        verification: {
          status: "no_code_claims",
          issues: [],
        },
      });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByLabelText("Agent tools"));
    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "verify this");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("No code claims")).not.toBeNull());
    expect(document.querySelector('.verification-status[data-status="no_code_claims"]')).not.toBeNull();
    expect(screen.queryByText("Unverified claim")).toBeNull();
  });

  it("opens setup controls from the Settings sidebar item", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("Backend URL")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Settings" })).not.toBeNull();
    expect(screen.getByText("Backend URL")).not.toBeNull();
    expect(screen.getByRole("button", { name: /test connection/i })).not.toBeNull();
  });

  it("does not render the legacy manual project context form", () => {
    render(<App />);

    expect(screen.queryByText("Project context")).toBeNull();
    expect(screen.queryByLabelText("Project path")).toBeNull();
    expect(screen.queryByLabelText("Selected content")).toBeNull();
  });

  it("restores stored projects and shows project indicators", async () => {
    render(<App />);

    expect(await screen.findByText("Llama Pack")).not.toBeNull();
    expect(screen.getByText("/Users/robertsmith/Apps/llama-pack")).not.toBeNull();
    expect(screen.getByText(/Backend tools can use this project only after its root is allowed in Llama Pack safe dirs/i)).not.toBeNull();
    expect(screen.getByText("Project: Llama Pack")).not.toBeNull();
    expect(document.querySelector(".app-shell.project-active")).not.toBeNull();
  });

  it("copies a project root from the project right click menu", async () => {
    const user = userEvent.setup();
    const clipboard = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    render(<App />);

    const project = await screen.findByRole("button", { name: /Llama Pack/ });
    fireEvent.contextMenu(project, { clientX: 24, clientY: 48 });

    expect(screen.getByRole("menu", { name: "Project context menu" })).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Copy project root" }));

    expect(clipboard.writeText).toHaveBeenCalledWith("/Users/robertsmith/Apps/llama-pack");
  });

  it("collapses and expands projects from the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggle = await screen.findByRole("button", { name: /projects/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Project name")).toBeNull();
    expect(screen.getByText("Selected project: Llama Pack")).not.toBeNull();

    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Project name")).not.toBeNull();
  });

  it("adds a local project, selects it, and updates the global indicator", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText("Project name"), "Website");
    await user.type(screen.getByLabelText("Project root"), "/Users/robertsmith/Apps/website");
    await user.click(screen.getByRole("button", { name: /add project/i }));

    await waitFor(() => expect(saveProject).toHaveBeenCalled());
    expect(saveProject.mock.calls[0][0]).toMatchObject({
      name: "Website",
      root: "/Users/robertsmith/Apps/website",
    });
    await waitFor(() => expect(document.body.textContent).toContain("Selected project: Website"));
    expect(document.body.textContent).toContain("Project: Website");
  });
});
