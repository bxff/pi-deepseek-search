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

## How it works

Most pi search extensions make separate API calls to external services like Exa or Brave. This one doesn't. It just points DeepSeek's Anthropic-compatible endpoint at a different URL and adds `web_search_20260209` as a server side tool. The model handles the search inline, same turn, same call. No roundtrips to a third party.

Originally inspired by [@wierdbytes/pi-web](https://pi.dev/packages/@wierdbytes/pi-web), which does the same thing with Anthropic's endpoint. This swaps Anthropic for DeepSeek and strips everything down to just what's needed.
