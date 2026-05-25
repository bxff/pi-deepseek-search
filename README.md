# pi-deepseek-search

Web search for pi. Uses DeepSeek. No extra keys needed if you already have DeepSeek set up.

```bash
pi install npm:pi-deepseek-search
```

DeepSeek's docs say web search isn't supported on their API. It is. Their Anthropic-compatible endpoint quietly handles `web_search_20260209`, the same server side tool Anthropic uses. Completely undocumented. I stumbled on it while trying to figure out why Claude Code's search kept working through DeepSeek.

Your existing DeepSeek key is all it needs. No extra signups, no config.

Uses `deepseek-v4-flash` by default. Switch it:

```bash
export DEEPSEEK_SEARCH_MODEL=deepseek-v4-pro
```
