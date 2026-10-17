# pi-deepseek-search

Search the web from Pi using DeepSeek's [Search & Fetch APIs](https://api-docs.deepseek.com/guides/search).

```bash
pi install npm:pi-deepseek-search
```

`web_search` takes a `query` and optional `allowed_domains` or `blocked_domains`, and returns links and summaries. `web_fetch` takes a `url` and reads the page as Markdown. Search uses the API defaults: 10 results, without full page content.

The extension uses the DeepSeek key from Pi's `/login` or `DEEPSEEK_API_KEY`. It works with any active model.

To use the original model-mediated search instead of the standalone Search API:

```bash
DEEPSEEK_SEARCH_BACKEND=server pi
```

Server mode uses an additional DeepSeek model request for search, with `DEEPSEEK_SEARCH_MODEL` defaulting to `deepseek-flash`. Fetch remains standalone.

## Pricing

Standalone Search and Fetch cost [$0.75 per 1,000 successful requests](https://api-docs.deepseek.com/guides/search/#billing). Failed requests and empty results are free. The tool footer shows an estimated request cost.

Server search adds model-token charges and can make up to five native searches per call. DeepSeek's [temporary waiver for server-side request fees](https://api-docs.deepseek.com/quick_start/pricing/#search--fetch-pricing) ends November 1, 2026 at 00:00 Beijing time; standard request pricing applies after that. The announcement names DeepSeek Harness, Claude Code, and Codex; Pi's eligibility is not explicitly documented. Even during the waiver, model-token costs can make server search more expensive than the standalone API.

## Prime Agent

[`prime-deepseek-search`](https://www.npmjs.com/package/prime-deepseek-search) is a separate package and still uses the older model-mediated search tool.

[npm](https://www.npmjs.com/package/pi-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/pi-deepseek-search)
