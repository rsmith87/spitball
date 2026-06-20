import { afterEach, describe, expect, it, vi } from "vitest";
import { getContextBudget, sendChat, streamChat } from "./chat";

describe("sendChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains agent tool runtime failures with an actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ detail: "agent tool runtime is not enabled" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      sendChat(
        "http://controller.local",
        { mode: "external_api_key", apiKey: "key" },
        {
          model: "qwen",
          messages: [{ role: "user", content: "use tools" }],
          stream: false,
          tool_runtime: "agent",
        },
      ),
    ).rejects.toThrow(
      "Agent tools could not run: the selected agent has tools disabled or no tool catalog/profile configured. Enable agent tools on that node, then try again. Backend detail: agent tool runtime is not enabled",
    );
  });

  it("requests context budget from the shared backend API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://controller.local/lm-api/v1/chat/qwen/context-budget");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "X-Llama-Pack-Key": "key" });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          messages: [{ role: "user", content: "hello" }],
          request_type: "chat",
          max_tokens: 512,
        });
        return new Response(
          JSON.stringify({
            model: "qwen",
            context_window_tokens: 32768,
            prompt_tokens_estimated: 100,
            reserved_completion_tokens: 512,
            available_input_tokens: 32256,
            remaining_context_tokens: 32156,
            usage_ratio: 0.018,
            status: "comfortable",
            estimation_method: "approx_chars_div_4",
            precision: "approximate",
            warnings: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const budget = await getContextBudget(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
        request_type: "chat",
        stream: false,
      },
      512,
    );

    expect(budget.remaining_context_tokens).toBe(32156);
  });

  it("returns assistant content with non-streaming telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "assistant ok" } }],
            thread_id: "thread-123",
            usage: { prompt_tokens: 21, completion_tokens: 7 },
            timings: { prompt_ms: 35, predicted_ms: 700, predicted_n: 7 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await sendChat(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      },
    );

    expect(result).toEqual({
      content: "assistant ok",
      threadId: "thread-123",
      telemetry: {
        promptTokens: 21,
        completionTokens: 7,
        promptMs: 35,
        completionMs: 700,
        tokensPerSecond: 10,
      },
    });
  });

  it("passes streaming telemetry chunks with content deltas", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"type":"thread","thread_id":"thread-stream"}\n\n'));
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" there"}}],"usage":{"prompt_tokens":8,"completion_tokens":2},"timings":{"predicted_ms":250,"predicted_n":2}}\n\n'));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );
    const deltas: Array<{ content: string; telemetry?: { tokensPerSecond?: number } }> = [];

    await streamChat(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      (delta) => deltas.push(delta),
    );

    expect(deltas).toEqual([
      { content: "", threadId: "thread-stream" },
      { content: "hi" },
      {
        content: " there",
        telemetry: {
          promptTokens: 8,
          completionTokens: 2,
          completionMs: 250,
          tokensPerSecond: 8,
        },
      },
    ]);
  });

  it("passes final streaming telemetry chunks without content", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"done"}}]}\n\n'));
              controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":13,"completion_tokens":4},"timings":{"predicted_ms":1000,"predicted_n":4}}\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );
    const deltas: Array<{ content: string; telemetry?: { tokensPerSecond?: number } }> = [];

    await streamChat(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      (delta) => deltas.push(delta),
    );

    expect(deltas).toEqual([
      { content: "done" },
      {
        content: "",
        telemetry: {
          promptTokens: 13,
          completionTokens: 4,
          completionMs: 1000,
          tokensPerSecond: 4,
        },
      },
    ]);
  });
});
