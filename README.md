# pi-deepseek-search

Search the web and fetch pages in Pi using DeepSeek's [standalone Search & Fetch APIs](https://api-docs.deepseek.com/guides/search). These tools work with **any active Pi model**; they only require a DeepSeek API key.

```bash
pi install npm:pi-deepseek-search
```

The extension registers two tools:

- `web_search({ query, count?, need_content?, ori_question?, localization?, allowed_domains?, blocked_domains? })` returns ranked links, summaries, and optional page content. `count` defaults to 10 and may be 1–50. DeepSeek's query syntax supports `site:`, `-site:`, quoted phrases, `lang:`, `after:`, and `before:`. The legacy domain options are converted to `site:`/`-site:` operators; they cannot be combined.
- `web_fetch({ url })` retrieves one HTTP(S) page as Markdown. URLs with embedded credentials are rejected.

To keep Pi's context manageable, `need_content` displays at most 8,000 characters per result and `web_fetch` displays at most 100,000 characters per page. The full API response remains in the tool's structured details.

The extension uses the key saved for the `deepseek` provider through Pi's `/login`, or `DEEPSEEK_API_KEY`. It also accepts `ANTHROPIC_AUTH_TOKEN` for compatibility with existing DeepSeek setups. The old `DEEPSEEK_SEARCH_MODEL` setting is no longer used: neither tool runs a model or consumes model tokens.

Search calls `POST /v1/tools/search`; Fetch calls `POST /v1/tools/fetch`. Both use bearer authentication. The tool result shows an **estimated** request cost and includes `billable` and `estimatedCostUsd` in its details. At DeepSeek's published price, each successful Search with at least one result or Fetch with content costs **$0.00075** ($0.75 per 1,000 requests). Failed requests, empty searches, and Fetch responses without content are not billable. Result count does not change the price. This is separate from any model usage charges; the extension cannot read your account's actual invoice.

DeepSeek currently limits Search and Fetch independently to 5 requests per second per account; Fetch also has a per-domain limit. The extension retries HTTP 408, 429, and 5xx responses up to three attempts, honoring `Retry-After` seconds when supplied. Other 4xx errors are returned without retrying.

DeepSeek says server-side Search/Fetch calls made through DeepSeek Harness, Claude Code, or Codex are free until November 1, 2026 (Beijing time). This Pi extension calls the **standalone APIs directly**, so its displayed cost uses the standalone per-request price. See the [official guide](https://api-docs.deepseek.com/guides/search) and [Search](https://api-docs.deepseek.com/api/search) / [Fetch](https://api-docs.deepseek.com/api/fetch) references for current billing and response rules.

## Prime Agent

Prime Agent users can install the separate [`prime-deepseek-search`](https://www.npmjs.com/package/prime-deepseek-search) package. It still uses DeepSeek's older model-mediated server-side search path; this Pi update does not change that package.

[npm](https://www.npmjs.com/package/pi-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/pi-deepseek-search)
