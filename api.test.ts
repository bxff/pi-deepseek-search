import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchRequest, fetchPage, search, validateFetchUrl } from "./api.ts";

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
      count: 5,
      allowed_domains: ["github.com", "example.org"],
    }),
    {
      query: "DeepSeek site:github.com OR site:example.org",
      count: 5,
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
  assert.throws(() => buildSearchRequest({ query: "x", count: 51 }), /count/);
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
  assert.throws(() => buildSearchRequest({ query: "x", localization: "not-an-ip" }), /IP address/);
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
      count: 50,
      need_content: true,
      ori_question: "What is DeepSeek?",
    },
    undefined,
    mockFetch,
  );
  assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(calls[0].options.body as string), {
    query: "DeepSeek",
    count: 50,
    need_content: true,
    ori_question: "What is DeepSeek?",
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
