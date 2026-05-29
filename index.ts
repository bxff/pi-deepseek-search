/**
 * deepseek-search — Zero-config web search for pi
 * via DeepSeek's Anthropic-compatible endpoint.
 *
 * Server-side tool: web_search_20260209 (the only server tool DeepSeek supports; web_search_20250305 also works but is older)
 *
 * Auth: auto-detects your DeepSeek key from pi's /login or env vars.
 * No config files, no extra env vars needed.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_BASE = "https://api.deepseek.com/anthropic";
const SEARCH_MODEL = process.env.DEEPSEEK_SEARCH_MODEL || "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function resolveApiKey(ctx: ExtensionContext): Promise<string> {
  const key = await ctx.modelRegistry.getApiKeyForProvider("deepseek");
  if (key) return key;
  const cc = process.env.ANTHROPIC_AUTH_TOKEN;
  if (cc) return cc;
  throw new Error(
    "No DeepSeek API key found. Run /login in pi and select DeepSeek, or set DEEPSEEK_API_KEY.",
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SearchSource {
  title: string;
  url: string;
  pageAge?: string | null;
}

async function callAnthropic(
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<{
  answerParts: string[];
  sources: SearchSource[];
  model: string;
  tokens: number;
}> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const s = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: s,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const err = (await response.json()) as { error?: { message?: string } };
      detail = err.error?.message || detail;
    } catch { /* non-JSON */ }
    throw new Error(`DeepSeek API ${response.status}: ${detail}`);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const answerParts: string[] = [];
  const sources: SearchSource[] = [];
  let modelName = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        if (event.type === "message_start") {
          if (event.message?.model) modelName = event.message.model;
          if (event.message?.usage) inputTokens = event.message.usage.input_tokens || 0;
        }
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
            const count = block.content.length;
            onProgress?.(`Found ${count} result${count === 1 ? "" : "s"}…`);
            for (const entry of block.content) {
              if (entry.type === "web_search_result") {
                sources.push({
                  title: entry.title || "Untitled",
                  url: entry.url || "",
                  pageAge: entry.page_age,
                });
              }
            }
          }
        }
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            const lastIdx = answerParts.length - 1;
            if (lastIdx >= 0) answerParts[lastIdx] += delta.text;
            else answerParts.push(delta.text);
          }
        }
        if (event.type === "message_delta") {
          if (event.usage) outputTokens = event.usage.output_tokens || 0;
        }
      } catch { /* skip malformed */ }
    }
  }

  return { answerParts, sources, model: modelName || "deepseek-v4-flash", tokens: inputTokens + outputTokens };
}

function formatSources(sources: SearchSource[]): string {
  if (sources.length === 0) return "";
  return [
    "",
    "Links:",
    ...sources.map(
      (s, i) =>
        `${i + 1}. [${s.title}](${s.url})${s.pageAge ? ` (${s.pageAge})` : ""}`,
    ),
  ].join("\n");
}

const CITATION_REMINDER =
  "\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.";

// ---------------------------------------------------------------------------
// Tool: web_search
// ---------------------------------------------------------------------------

const webSearchParams = Type.Object({
  query: Type.String({ 
    minLength: 2,
    description: "The search query. Be specific and include relevant keywords.",
  }),
  allowed_domains: Type.Optional(
    Type.Array(Type.String(), {
      description: "Restrict results to these domains (e.g. ['python.org']). Cannot combine with blocked_domains.",
    }),
  ),
  blocked_domains: Type.Optional(
    Type.Array(Type.String(), {
      description: "Exclude these domains from results. Cannot combine with allowed_domains.",
    }),
  ),
});

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function deepseekSearchExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    // Only register if DeepSeek is configured
    try {
      const key = await resolveApiKey(ctx);
      if (!key) return;
    } catch {
      return;
    }

    pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      `Search the web via DeepSeek. Returns search results with titles, URLs, and a brief summary. The current date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" })} — use the current year for recent queries.`,
    promptSnippet:
      "web_search: search the web via DeepSeek. Returns results with titles, URLs, and a brief summary.",
    promptGuidelines: [
      "Use web_search when you need current or source-backed information outside your training data.",
      "After receiving search results, synthesize a clear answer and cite sources with markdown hyperlinks.",
    ],
    parameters: webSearchParams,

    renderCall(args, theme) {
      const p = args as { query: string; allowed_domains?: string[]; blocked_domains?: string[] };
      let text = theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", `"${p.query || "..."}"`);
      const tags: string[] = [];
      if (p.allowed_domains?.length) tags.push(`+${p.allowed_domains.length}d`);
      if (p.blocked_domains?.length) tags.push(`-${p.blocked_domains.length}d`);
      if (tags.length) text += " " + theme.fg("dim", tags.join(" "));
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const text = result.content[0];
      const body = text?.type === "text" ? text.text : "";
      const xtag = /<[^>]*(?:tool_calls|invoke|parameter)[^>]*>/g;
      const clean = body.replace(xtag, "")
        .replace(/\n*REMINDER:.*$/s, "");
      const lines = clean.split("\n");
      if (!expanded) {
        const preview = lines.slice(0, 6);
        if (lines.length > 6) preview.push(theme.fg("dim", `... ${lines.length - 6} more lines · ctrl+o to expand`));
        return new Text(preview.join("\n"), 0, 0);
      }
      return new Text(clean, 0, 0);
    },

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const p = params as {
        query: string;
        allowed_domains?: string[];
        blocked_domains?: string[];
      };
      const query = p.query?.trim();
      if (!query) {
        return { content: [{ type: "text", text: "Error: query is required." }], isError: true };
      }

      onUpdate?.({ content: [{ type: "text", text: "Searching [v14-fix]…" }] });

      let firstProgress = true;
      const onProgress = (msg: string) => {
        if (firstProgress) {
          onUpdate?.({ content: [{ type: "text", text: msg }] });
          firstProgress = false;
        }
      };

      try {
        const apiKey = await resolveApiKey(ctx);
        const tool: Record<string, unknown> = {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 8,
        };
        if (p.allowed_domains?.length) tool.allowed_domains = p.allowed_domains;
        if (p.blocked_domains?.length) tool.blocked_domains = p.blocked_domains;

        const result = await callAnthropic(
          apiKey,
          {
            model: SEARCH_MODEL,
            max_tokens: DEFAULT_MAX_TOKENS,
            messages: [{ role: "user", content: query }],
            system: "You are an assistant for performing a web search tool use. Do not output tool call syntax.",
            tools: [tool],
          },
          signal,
          onProgress,
        );

        const xtag = /<[^>]*(?:tool_calls|invoke|parameter)[^>]*>/g;
        const answer = result.answerParts
          .join("\n\n")
          .replace(xtag, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || `No results for: ${query}`;
        const sourceText = answer + formatSources(result.sources) + CITATION_REMINDER;
        const footer = `\n\n*${result.tokens.toLocaleString()} tokens · ${result.model}*`;
        return { content: [{ type: "text", text: sourceText + footer }], details: { sources: result.sources } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Search failed: ${message}` }], isError: true };
      }
    },
  });
  });
}
