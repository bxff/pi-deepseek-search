---
name: deepseek-search
description: Search the web via DeepSeek's server-side search (Anthropic-compatible endpoint). Use when you need current or source-backed information outside your training data. Backed by the DeepSeek API key already saved via /login — no extra setup. Coexists with the bundled Serper-based websearch skill.
license: MIT
---

# DeepSeek Search

Search the web using DeepSeek's server-side `web_search_20260209` tool. The search runs on
DeepSeek's servers during inference, so this works with the DeepSeek API key already stored
via `/login` (provider: `deepseek`). No additional API keys or config required.

## Setup

The DeepSeek API key is read automatically from Prime Agent's `auth.json` (the key saved by
`/login` for the `deepseek` provider) or from the `DEEPSEEK_API_KEY` environment variable.
If search reports a missing key, ask the user to run `/login` and add their DeepSeek key
(provider: `deepseek`).

Optional overrides (environment variables):

- `DEEPSEEK_SEARCH_MODEL` - DeepSeek model to run the search with (default `deepseek-v4-flash`).
- `PRIME_AGENT_WEBSEARCH_TIMEOUT` - HTTP timeout in seconds (default 60).

## Usage

Call the prepared `deepseek_search` import directly in the IPython kernel:

```python
print(await deepseek_search("latest OpenUSD security advisories"))
```

Optional keyword arguments:

- `model` - override the DeepSeek model for this call.
- `allowed_domains` / `blocked_domains` - restrict/exclude domains (mutually exclusive).
- `max_output` - truncate the returned text to this many characters (default 8192).
- `timeout` - HTTP timeout in seconds.
- `num_results` - accepted for API compatibility with the Serper skill; DeepSeek returns a
  synthesized answer plus sources instead of ranked results, so this is ignored.

Returns the synthesized answer plus cited source links.

## Notes

- Only works with DeepSeek models (the search happens on DeepSeek's side).
- This skill **coexists** with Prime Agent's bundled Serper-based `websearch` skill; it does
  not override it.
