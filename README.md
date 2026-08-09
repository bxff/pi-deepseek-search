# pi-deepseek-search

Web search for **Pi** and **Prime Agent** using DeepSeek's server-side search
(`web_search_20260209`). The search runs on DeepSeek's Anthropic-compatible endpoint, so
this switches your search calls there automatically — no extra API keys or config if you
already use DeepSeek.

![demo](demo.gif)

## Which package do I need?

This repo publishes **two packages** — one per client, deliberately kept separate:

| You use | Install | You get |
|---|---|---|
| Pi | `pi install npm:pi-deepseek-search` | the `web_search` **tool** (extension) |
| Prime Agent | `prime-agent package install npm:prime-deepseek-search` | the `deepseek-search` **skill** (`await deepseek_search(...)` in the kernel) |

Both read the DeepSeek key already saved via `/login` (provider `deepseek`) — no extra config.

## Pi: the `web_search` tool

Adds a `web_search` tool Pi can call directly, backed by DeepSeek's server-side search
(previously undocumented; DeepSeek has since
[officially documented](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code)
Anthropic API web search tool support).

```bash
pi install npm:pi-deepseek-search
```

**Limitations:** only works with DeepSeek models — the search runs on DeepSeek's servers during
inference, so it can't be used with Anthropic, OpenAI, or any other provider. Defaults to
`deepseek-v4-flash`; set `DEEPSEEK_SEARCH_MODEL` to change it.

Read more: [Using DeepSeek's undocumented web search in Pi](https://musaab.io/posts/2026/deepseek-search)

## Prime Agent: the `deepseek-search` skill

Provides a kernel-callable skill — a function the agent invokes directly, with the same
"call a function" experience as Prime Agent's bundled Serper search:

```bash
prime-agent package install npm:prime-deepseek-search
```

```python
import deepseek_search
print(await deepseek_search("latest OpenUSD security advisories"))
```

Optional kwargs: `model`, `allowed_domains`, `blocked_domains`, `max_output`, `timeout`
(`num_results` is accepted for Serper-API compatibility and ignored).
Env overrides: `DEEPSEEK_SEARCH_MODEL`, `PRIME_AGENT_WEBSEARCH_TIMEOUT`.

The skill **coexists** with Prime Agent's bundled Serper `websearch` skill — it does not
override it. See [prime-deepseek-search on npm](https://www.npmjs.com/package/prime-deepseek-search)
for the full docs.

## Installed the wrong one?

- **Prime Agent + this package**: you get the `web_search` tool, not the kernel skill. Fix:
  `prime-agent package remove npm:pi-deepseek-search` then
  `prime-agent package install npm:prime-deepseek-search`.
- **Pi + `prime-deepseek-search`**: Pi loads the SKILL.md as a markdown skill but has no
  Python-kernel skill runner, so the instructions can't execute. Fix:
  `pi remove npm:prime-deepseek-search` then `pi install npm:pi-deepseek-search`.

## Why two packages?

Both clients read all four `pi.*` manifest fields (`extensions`, `skills`, `prompts`,
`themes`) and neither supports conditional loading — a single package would hand Pi a skill
it can't run and Prime Agent a tool it didn't ask for. Two packages is the only clean
separation.

## Links

[npm](https://www.npmjs.com/package/pi-deepseek-search) ·
[GitHub](https://github.com/bxff/pi-deepseek-search) ·
[pi.dev](https://pi.dev/packages/pi-deepseek-search) ·
[prime-deepseek-search on npm](https://www.npmjs.com/package/prime-deepseek-search)
