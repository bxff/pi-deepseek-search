# pi-deepseek-search

Web search for pi. Uses DeepSeek. No extra keys needed if you already have DeepSeek set up.

```bash
pi install npm:pi-deepseek-search
```

## I found this by accident

DeepSeek's docs say web search isn't supported on their API. It is. Their Anthropic-compatible endpoint at `api.deepseek.com/anthropic` quietly handles `web_search_20260209`, the same server side tool Anthropic exposes. Completely undocumented. I tripped over it while trying to figure out why Claude Code's search kept working when pointed at DeepSeek.

This extension just calls that endpoint. Your existing DeepSeek key (the one pi already uses from /login or DEEPSEEK_API_KEY) is all it needs. No signups, no separate API keys, nothing to configure.

## Change the model

Defaults to deepseek-v4-flash. Switch it if you want:

```bash
export DEEPSEEK_SEARCH_MODEL=deepseek-v4-pro
```
