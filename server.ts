/** Optional model-mediated search through DeepSeek's native server tool. */

import { buildSearchRequest, type SearchInput } from "./api.ts";

interface Source {
  type: string;
  title: string;
  url: string;
  page_age?: string;
  snippet?: string;
}

interface Block {
  type: string;
  citations?: Array<{ url: string; cited_text?: string }>;
  content?: Source[] | { error_code?: string };
}

interface MessagesResponse {
  model: string;
  content: Block[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function serverSearch(
  apiKey: string,
  input: SearchInput,
  model: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
) {
  const { query } = buildSearchRequest(input);
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetchImpl("https://api.deepseek.com/anthropic/v1/messages", {
    method: "POST",
    redirect: "error",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `Perform a web search using this exact query, preserving all search operators: ${query}`,
        },
      ],
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 5,
        },
      ],
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      detail = data.error?.message || detail;
    } catch {
      signal?.throwIfAborted();
      timeout.throwIfAborted();
      /* Preserve the HTTP status when the error body is not JSON. */
    }
    throw new Error(`DeepSeek server search ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as MessagesResponse;
  if (!Array.isArray(data?.content))
    throw new Error("DeepSeek returned an invalid Messages payload.");
  const results = data.content.filter((block) => block.type === "web_search_tool_result");
  if (!results.length) throw new Error("DeepSeek did not perform a native web search.");

  const snippets = new Map<string, string>();
  for (const block of data.content) {
    for (const citation of block.citations || []) {
      if (citation.cited_text && !snippets.has(citation.url))
        snippets.set(citation.url, citation.cited_text);
    }
  }
  const sources: Array<{
    title: string;
    url: string;
    pageAge?: string;
    snippet?: string;
  }> = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (!Array.isArray(result.content)) {
      throw new Error(
        `DeepSeek server search failed: ${result.content?.error_code || "invalid result"}`,
      );
    }
    for (const item of result.content) {
      if (
        item.type !== "web_search_result" ||
        typeof item.url !== "string" ||
        !item.url ||
        seen.has(item.url)
      )
        continue;
      seen.add(item.url);
      sources.push({
        title: item.title || item.url,
        url: item.url,
        pageAge: item.page_age,
        snippet: item.snippet || snippets.get(item.url),
      });
    }
  }
  return {
    sources,
    model: data.model || model,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}
