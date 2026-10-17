# pi-deepseek-search

Search the web from Pi using DeepSeek's [Search & Fetch APIs](https://api-docs.deepseek.com/guides/search).

```bash
pi install npm:pi-deepseek-search
```

`web_search` returns links and summaries. `web_fetch` reads a page as Markdown. Search accepts `count` (1–50), `need_content`, `ori_question`, and `localization`. The existing `allowed_domains` and `blocked_domains` options still work through DeepSeek's `site:` query operators.

The extension uses the DeepSeek key from Pi's `/login` or `DEEPSEEK_API_KEY`. It works with any active model; `DEEPSEEK_SEARCH_MODEL` is no longer used.

## Pricing

DeepSeek charges [$0.75 per 1,000 successful requests](https://api-docs.deepseek.com/guides/search#billing) for Search and Fetch. A search with no results, a fetch with no content, or a failed request is free. The tool details include the estimated cost of each call. These are direct API calls; DeepSeek's temporary free period for server-side tool calls in other harnesses does not apply.

## Prime Agent

[`prime-deepseek-search`](https://www.npmjs.com/package/prime-deepseek-search) is a separate package and still uses the older model-mediated search tool.

[npm](https://www.npmjs.com/package/pi-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/pi-deepseek-search)
