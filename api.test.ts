import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchRequest, fetchPage, search, validateFetchUrl } from "./api.ts";
import { serverSearch } from "./server.ts";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("search maps legacy domain filters to documented query operators", () => {
  assert.deepEqual(
    buildSearchRequest({
      query: "DeepSeek",
      allowed_domains: ["github.com", "example.org"],
    }),
    {
      query: "DeepSeek site:github.com OR site:example.org",
    },
  );
  assert.equal(
    buildSearchRequest({ query: "DeepSeek", blocked_domains: ["ads.example"] }).query,
    "DeepSeek -site:ads.example",
  );
  assert.throws(
    () =>
      buildSearchRequest({
        query: "x",
        allowed_domains: ["https://example.org"],
      }),
    /plain domain names/,
  );
  assert.throws(
    () =>
      buildSearchRequest({
        query: "x",
        allowed_domains: ["a.org"],
        blocked_domains: ["b.org"],
      }),
    /cannot be combined/,
  );
  assert.throws(() => buildSearchRequest({ query: " ".repeat(5) }), /query/);
  assert.equal(buildSearchRequest({ query: "🧪".repeat(128) }).query, "🧪".repeat(128));
  assert.throws(
    () =>
      buildSearchRequest({
        query: "a".repeat(120),
        allowed_domains: ["example.org"],
      }),
    /128/,
  );
});

test("Search uses the standalone endpoint, bearer auth, documented body and per-request cost", async () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const mockFetch = (async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return jsonResponse({
      results: [
        {
          title: "Example",
          url: "https://example.com",
          summary: "Summary",
          content: "",
        },
      ],
    });
  }) as typeof fetch;
  const result = await search(
    "test-key",
    {
      query: "DeepSeek",
    },
    undefined,
    mockFetch,
  );
  assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
  assert.equal(
    (calls[0].options.headers as Record<string, string>).Authorization,
    "Bearer test-key",
  );
  assert.deepEqual(JSON.parse(calls[0].options.body as string), {
    query: "DeepSeek",
  });
  assert.equal(result.billable, true);
  assert.equal(result.estimatedCostUsd, 0.00075);
  assert.equal(result.results[0].url, "https://example.com");
});

test("empty Search results are not billed", async () => {
  const mockFetch = (async () => jsonResponse({ results: [] })) as typeof fetch;
  const result = await search("key", { query: "unlikely" }, undefined, mockFetch);
  assert.equal(result.billable, false);
  assert.equal(result.estimatedCostUsd, 0);
});

test("Fetch validates URLs, uses its own endpoint, and charges only for content", async () => {
  assert.throws(() => validateFetchUrl("file:///etc/passwd"), /HTTP\(S\)/);
  assert.throws(() => validateFetchUrl("https://user:pass@example.org"), /username or password/);
  assert.throws(() => validateFetchUrl("https://example.org/" + "a".repeat(8192)), /8192/);
  const calls: string[] = [];
  const mockFetch = (async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.deepEqual(JSON.parse(options.body as string), {
      url: "https://example.org/article",
    });
    return jsonResponse({ title: "Article", content: "# Article\n\nText" });
  }) as typeof fetch;
  const result = await fetchPage("key", "https://example.org/article", undefined, mockFetch);
  assert.deepEqual(calls, ["https://api.deepseek.com/v1/tools/fetch"]);
  assert.equal(result.page.content, "# Article\n\nText");
  assert.equal(result.estimatedCostUsd, 0.00075);
  const empty = await fetchPage("key", "https://example.org/article", undefined, (async () =>
    jsonResponse({ title: "", content: "" })) as typeof fetch);
  assert.equal(empty.estimatedCostUsd, 0);
});

test("retries 429 but does not retry non-retryable 4xx", async () => {
  let requests = 0;
  const retryFetch = (async () => {
    requests++;
    return requests === 1
      ? jsonResponse({ error: { message: "rate limited" } }, 429, {
          "retry-after": "0",
        })
      : jsonResponse({ results: [] });
  }) as typeof fetch;
  await search("key", { query: "test" }, undefined, retryFetch);
  assert.equal(requests, 2);
  requests = 0;
  const rejectFetch = (async () => {
    requests++;
    return jsonResponse({ error: { message: "blocked" } }, 403);
  }) as typeof fetch;
  await assert.rejects(
    fetchPage("key", "https://example.org", undefined, rejectFetch),
    /DeepSeek fetch API 403: blocked/,
  );
  assert.equal(requests, 1);
});

test("cancellation stops a retry before another request", async () => {
  const controller = new AbortController();
  let requests = 0;
  const mockFetch = (async () => {
    requests++;
    controller.abort(new Error("cancelled"));
    return jsonResponse({ error: { message: "rate limited" } }, 429);
  }) as typeof fetch;
  await assert.rejects(search("key", { query: "test" }, controller.signal, mockFetch), {
    name: "AbortError",
  });
  assert.equal(requests, 1);
});

test("server backend uses native search, deduplicates sources and reports model usage without a fee estimate", async () => {
  const mockFetch = (async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.deepseek.com/anthropic/v1/messages");
    assert.equal((options.headers as Record<string, string>)["x-api-key"], "key");
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(
      body.messages[0].content,
      "Perform a web search using this exact query, preserving all search operators: DeepSeek site:deepseek.com",
    );
    assert.deepEqual(body.tools, [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 5,
      },
    ]);
    return jsonResponse({
      model: "deepseek-flash",
      content: [
        {
          type: "text",
          text: "Answer with an invented URL: https://invented.example",
          citations: [{ url: "https://deepseek.com", cited_text: "Grounded excerpt" }],
        },
        {
          type: "web_search_tool_result",
          content: [
            {
              type: "web_search_result",
              title: "DeepSeek",
              url: "https://deepseek.com",
            },
            {
              type: "web_search_result",
              title: "Duplicate",
              url: "https://deepseek.com",
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  }) as typeof fetch;
  const result = await serverSearch(
    "key",
    {
      query: "DeepSeek",
      allowed_domains: ["deepseek.com"],
    },
    "deepseek-flash",
    undefined,
    mockFetch,
  );
  assert.equal("answer" in result, false);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].snippet, "Grounded excerpt");
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 20);
  assert.equal("estimatedCostUsd" in result, false);
});

test("server backend rejects missing searches and native tool errors, and preserves truncated results", async () => {
  const cases = [
    {
      content: [{ type: "text", text: "An answer without searching" }],
      expected: /did not perform/,
    },
    {
      content: [
        {
          type: "web_search_tool_result",
          content: { error_code: "max_uses_exceeded" },
        },
      ],
      expected: /max_uses_exceeded/,
    },
  ];
  for (const { expected, ...payload } of cases) {
    await assert.rejects(
      serverSearch("key", { query: "test" }, "deepseek-flash", undefined, (async () =>
        jsonResponse(payload)) as typeof fetch),
      expected,
    );
  }
  const truncated = await serverSearch(
    "key",
    { query: "test" },
    "deepseek-flash",
    undefined,
    (async () =>
      jsonResponse({
        content: [{ type: "web_search_tool_result", content: [] }],
        stop_reason: "max_tokens",
      })) as typeof fetch,
  );
  assert.deepEqual(truncated.sources, []);
});

test("server backend preserves HTTP failures and caller cancellation without retrying model turns", async () => {
  let requests = 0;
  await assert.rejects(
    serverSearch("key", { query: "test" }, "deepseek-flash", undefined, (async () => {
      requests++;
      return jsonResponse({ error: { message: "out of balance" } }, 402);
    }) as typeof fetch),
    /402: out of balance/,
  );
  assert.equal(requests, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    serverSearch("key", { query: "test" }, "deepseek-flash", controller.signal, (async (
      _url: string,
      options: RequestInit,
    ) => {
      options.signal?.throwIfAborted();
      throw new Error("Expected an aborted signal");
    }) as typeof fetch),
    { name: "AbortError" },
  );
});
