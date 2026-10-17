# prime-deepseek-search

```bash
prime-agent package install npm:prime-deepseek-search
```

Search the web and read pages from Prime Agent using DeepSeek's [Search & Fetch APIs](https://api-docs.deepseek.com/guides/search/). Uses the DeepSeek key saved through `/login` or `DEEPSEEK_API_KEY`, with any active model.

```python
print(await deepseek_search("latest OpenUSD security advisories"))
print(await deepseek_search.fetch("https://openusd.org/"))
```

Search accepts optional `allowed_domains` or `blocked_domains`. The existing `num_results` option now controls the result count (1–50, default 10). Both calls support `max_output` and `timeout`; `PRIME_AGENT_WEBSEARCH_TIMEOUT` sets the default HTTP timeout in seconds.

To use model-mediated server search, set `DEEPSEEK_SEARCH_BACKEND=server` before starting Prime Agent. `DEEPSEEK_SEARCH_MODEL` or the existing `model` keyword selects its DeepSeek model (default `deepseek-flash`). Fetch remains standalone.

## Pricing

Standalone Search and Fetch cost [$0.75 per 1,000 successful requests](https://api-docs.deepseek.com/guides/search/#billing). Failed requests and empty results are free. Returned costs are estimates.

Server search adds model-token charges and can make up to five native searches per call. DeepSeek's [temporary waiver for server-side request fees](https://api-docs.deepseek.com/quick_start/pricing/#search--fetch-pricing) ends November 1, 2026 at 00:00 Beijing time; standard request pricing applies after that. Even during the waiver, model-token costs can make server search more expensive than the standalone API.

Coexists with Prime Agent's bundled Serper `websearch` skill. Pi users: install [`pi-deepseek-search`](https://www.npmjs.com/package/pi-deepseek-search) instead.

[npm](https://www.npmjs.com/package/prime-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/prime-deepseek-search) · [Blog post](https://musaab.io/posts/2026/deepseek-search)
