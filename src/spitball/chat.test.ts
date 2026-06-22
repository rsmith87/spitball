import { afterEach, describe, expect, it, vi } from "vitest";
import { compactThread, getContextBudget, sendChat, stopGeneration, streamChat } from "./chat";
import { parseSseContent } from "./streaming";

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
          max_tokens: 1024,
          tool_runtime: "agent",
        },
      ),
    ).rejects.toThrow(
      "Agent tools could not run: the selected agent has tools disabled or no tool catalog/profile configured. Enable agent tools on that node, then try again. Backend detail: agent tool runtime is not enabled",
    );
  });

  it("does not rewrite context summarization failures as disabled agent tools", async () => {
    const detail =
      "Failed to summarize chat request for model gemma-4-12b-it-Q4_K_M:default: Client error '400 Bad Request' for url 'http://127.0.0.1:8091/v1/chat/completions'. Estimated prompt tokens exceeded the configured context summarization trigger.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ detail }), {
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
          model: "gemma-4-12b-it-Q4_K_M:default",
          messages: [{ role: "user", content: "use tools" }],
          stream: false,
          max_tokens: 1024,
          tool_runtime: "agent",
        },
      ),
    ).rejects.toThrow(detail);
  });

  it("sends agent tool max iteration overrides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          tool_runtime: "agent",
          agent_tool_max_iterations: 12,
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: "assistant ok" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await sendChat(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "use tools" }],
        stream: false,
        max_tokens: 1024,
        tool_runtime: "agent",
        agent_tool_max_iterations: 12,
      },
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
        max_tokens: 512,
      },
      512,
    );

    expect(budget.remaining_context_tokens).toBe(32156);
  });

  it("sends stop generation requests through the shared backend API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://controller.local/lm-api/v1/chat/qwen/kv/slots/0");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "X-Llama-Pack-Key": "key" });
        expect(JSON.parse(String(init?.body))).toEqual({ action: "cancel", target: "auto" });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await stopGeneration("http://controller.local", { mode: "external_api_key", apiKey: "key" }, "qwen", 0, "auto");
  });

  it("requests manual thread compaction from the shared backend API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://controller.local/lm-api/v1/threads/thread-123/compact");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "X-Llama-Pack-Key": "key" });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: "qwen",
          target: "auto",
          recent_message_count: 2,
        });
        return new Response(
          JSON.stringify({
            summarized: true,
            summary_event_id: "summary-1",
            summary: "Older context summary",
            prompt_tokens_before: 4000,
            prompt_tokens_after: 900,
            covered_event_count: 6,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await compactThread(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        threadId: "thread-123",
        model: "qwen",
        target: "auto",
        recentMessageCount: 2,
      },
    );

    expect(result).toEqual({
      summarized: true,
      summaryEventId: "summary-1",
      summary: "Older context summary",
      promptTokensBefore: 4000,
      promptTokensAfter: 900,
      coveredEventCount: 6,
    });
  });

  it("returns assistant content with non-streaming telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ max_tokens: 2048 });
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
        max_tokens: 2048,
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

  it("returns context management metadata from non-streaming responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "assistant ok" } }],
            thread_id: "thread-123",
            context_management: {
              summarized: true,
              summary_event_id: "summary-1",
              prompt_tokens_before: 9000,
              prompt_tokens_after: 2200,
            },
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
        max_tokens: 2048,
      },
    );

    expect(result.contextManagement).toEqual({
      summarized: true,
      summaryEventId: "summary-1",
      promptTokensBefore: 9000,
      promptTokensAfter: 2200,
    });
  });

  it("returns verification metadata from non-streaming responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Use `src/fake.py`." } }],
            llama_pack: {
              verification: {
                status: "unverified",
                ok: false,
                verified_paths: [],
                missing_paths: ["src/fake.py"],
                verified_symbols: [],
                missing_symbols: [],
                missing_source_evidence: false,
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
        max_tokens: 2048,
      },
    );

    expect(result.verification).toEqual({
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
    });
  });

  it("passes streaming telemetry chunks with content deltas", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ max_tokens: 3072 });
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
        max_tokens: 3072,
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

  it("parses context management events from streams", () => {
    const deltas = parseSseContent(
      'data: {"type":"context_management","summarized":true,"summary_event_id":"summary-1","prompt_tokens_before":9000,"prompt_tokens_after":2200}',
    );

    expect(deltas).toEqual([
      {
        content: "",
        contextManagement: {
          summarized: true,
          summaryEventId: "summary-1",
          promptTokensBefore: 9000,
          promptTokensAfter: 2200,
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
        max_tokens: 1024,
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

  it("explains stream errors when the selected model is not running", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"type":"error","error":"Model is not running locally on agent host: qwen"}\n\n'));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }),
    );

    await expect(
      streamChat(
        "http://controller.local",
        { mode: "external_api_key", apiKey: "key" },
        {
          model: "qwen",
          messages: [{ role: "user", content: "hello" }],
          stream: true,
          max_tokens: 1024,
        },
        () => {},
      ),
    ).rejects.toThrow(
      "The selected model is not up: qwen. Start or load it in Llama Pack, then try again. Backend detail: Model is not running locally on agent host: qwen",
    );
  });

  it("parses agent tool progress events and final content", () => {
    const deltas = parseSseContent(
      [
        'data: {"type":"trace_event","id":"evt-1","event_type":"assistant_turn_started","status":"running","title":"Assistant turn 1","payload":{"iteration":1}}',
        'data: {"type":"trace_event","id":"evt-2","tool_call_id":"call-1","event_type":"tool_call_started","status":"running","title":"read_project_file started","payload":{"tool_name":"read_project_file","arguments":{"path":"llama_pack/core/benchmarks/runner.py","start_line":40,"end_line":88}}}',
        'data: {"type":"trace_event","id":"evt-3","tool_call_id":"call-1","event_type":"tool_call_completed","status":"passed","title":"read_project_file completed","payload":{"tool_name":"read_project_file","arguments":{"path":"llama_pack/core/benchmarks/runner.py","start_line":40,"end_line":88}}}',
        'data: {"type":"trace_event","id":"evt-4","event_type":"answer_verification_failed","status":"failed","title":"Answer verification failed","payload":{"missing_paths":["src/fake.py"],"issues":[{"kind":"missing_path","value":"src/fake.py","start":5,"end":16,"excerpt":"`src/fake.py`","severity":"failed"}]}}',
        'data: {"type":"final","choices":[{"message":{"role":"assistant","content":"final answer"}}]}',
      ].join("\n\n"),
    );

    expect(deltas).toEqual([
      { content: "", progress: { id: "assistant-generating", label: "Generating", status: "running", type: "status" } },
      {
        content: "",
        progress: {
          id: "tool-call-1",
          label: "read_project_file",
          status: "running",
          detail: "L40-L88",
          target: "runner.py",
          toolName: "read_project_file",
          type: "tool",
        },
      },
      {
        content: "",
        progress: {
          id: "tool-call-1",
          label: "read_project_file",
          status: "passed",
          detail: "L40-L88",
          target: "runner.py",
          toolName: "read_project_file",
          type: "tool",
        },
      },
      {
        content: "",
        progress: {
          id: "answer-reviewing",
          label: "Needs verification",
          status: "failed",
          type: "status",
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
      },
      { content: "final answer" },
    ]);
  });

  it("parses verification metadata from final agent tool payloads", () => {
    const deltas = parseSseContent(
      'data: {"type":"final","choices":[{"message":{"role":"assistant","content":"Use `src/fake.py`."}}],"llama_pack":{"verification":{"status":"unverified","ok":false,"verified_paths":[],"missing_paths":["src/fake.py"],"verified_symbols":[],"missing_symbols":[],"missing_source_evidence":false,"issues":[{"kind":"missing_path","value":"src/fake.py","start":5,"end":16,"excerpt":"`src/fake.py`","severity":"failed"}]}}}',
    );

    expect(deltas).toEqual([
      {
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
      },
    ]);
  });
});
