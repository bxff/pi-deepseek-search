# prime-deepseek-search

```bash
prime-agent package install npm:prime-deepseek-search
```

Adds web search to Prime Agent using DeepSeek's `web_search_20260209` server side tool, as a kernel-callable skill. Only available on DeepSeek's Anthropic-compatible endpoint. No extra API keys or config needed if you use DeepSeek in Prime Agent.

## Usage

```python
import deepseek_search
print(await deepseek_search("..."))
```

Optional kwargs: `model`, `allowed_domains`, `blocked_domains`, `max_output`, `timeout`. Env overrides: `DEEPSEEK_SEARCH_MODEL`, `PRIME_AGENT_WEBSEARCH_TIMEOUT`.

## Notes

Only works with DeepSeek models. The search runs on DeepSeek's servers during inference.

Coexists with Prime Agent's bundled Serper `websearch` skill. Pi users: install [`pi-deepseek-search`](https://www.npmjs.com/package/pi-deepseek-search) instead.

[npm](https://www.npmjs.com/package/prime-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/prime-deepseek-search)
