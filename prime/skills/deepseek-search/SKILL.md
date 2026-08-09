---
name: websearch
description: Search the web via DeepSeek's server-side search (Anthropic-compatible endpoint). Use when you need current or source-backed information outside your training data. Backed by the user's DeepSeek API key — no extra setup.
---

# Web Search

Search the web using DeepSeek's server-side `web_search_20260209` tool. The search runs on
DeepSeek's servers during inference, so this works with the DeepSeek API key already stored
via `/login` (provider: deepseek). No additional API keys or config required.

## Setup

The DeepSeek API key is read automatically from Prime Agent's `auth.json` (the key saved by
`/login` for the `deepseek` provider) or from the `DEEPSEEK_API_KEY` environment variable.
If web search reports a missing key, ask the user to run `/login` and add their DeepSeek
key (provider: deepseek).

Optional overrides (environment variables):

- `DEEPSEEK_SEARCH_MODEL` - DeepSeek model to run the search with (default `deepseek-v4-flash`).
- `PRIME_AGENT_WEBSEARCH_TIMEOUT` - HTTP timeout in seconds (default 60).

## Usage

Call the prepared `websearch` import directly in the IPython kernel:

```python
print(await websearch("latest OpenUSD security advisories"))
```

Optional keyword arguments:

- `model` - override the DeepSeek model for this call.
- `allowed_domains` / `blocked_domains` - restrict/exclude domains (mutually exclusive).
- `max_output` - truncate the returned text to this many characters (default 8192).
- `timeout` - HTTP timeout in seconds.

Returns the synthesized answer plus cited source links.

## Notes

- Only works with DeepSeek models (the search happens on DeepSeek's side).
- This user skill overrides Prime Agent's bundled Serper-based `websearch` skill.
