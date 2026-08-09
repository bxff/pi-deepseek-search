# pi-deepseek-search

![demo](demo.gif)

```bash
pi install npm:pi-deepseek-search
```

Adds web search to Pi using DeepSeek's `web_search_20260209` server side tool (previously undocumented). Only available on DeepSeek's Anthropic-compatible endpoint, so this switches your search calls there automatically. No extra API keys or config needed if you use DeepSeek in Pi.

> May 26, 2026: DeepSeek has now [officially documented](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code) the Anthropic API web search tool support.

## Limitations

Only works with DeepSeek models. The search runs on DeepSeek's servers during inference, so you can't use it with Anthropic, OpenAI, or any other provider.

Defaults to `deepseek-v4-flash`. Set `DEEPSEEK_SEARCH_MODEL` to change it.

Read more: [Using DeepSeek's undocumented web search in Pi](https://musaab.io/posts/2026/deepseek-search)

[npm](https://www.npmjs.com/package/pi-deepseek-search) · [GitHub](https://github.com/bxff/pi-deepseek-search) · [pi.dev](https://pi.dev/packages/pi-deepseek-search)


## Prime Agent

This repo ships **two packages**:

| Package | For | What you get |
|---|---|---|
| `pi-deepseek-search` (this one) | Pi | the `web_search` **extension tool** only |
| `prime-deepseek-search` (`./prime`) | Prime Agent | the `deepseek-search` **skill** (`await deepseek_search("query")` in the kernel) only |

The two are kept separate so Pi users don't get a skill they can't run, and Prime Agent users
don't get an extension tool when they asked for a kernel skill. **Install the package for your
client** — installing the wrong one is a soft failure (see below), not a break.

```bash
# Pi
pi install npm:pi-deepseek-search

# Prime Agent
prime-agent package install npm:prime-deepseek-search
```

Both read the DeepSeek key already saved via `/login` (provider `deepseek`) — no extra config.

### Installed the wrong one?

- Prime Agent + `pi-deepseek-search`: you get the `web_search` tool, not the kernel skill.
  Fix: `prime-agent package remove npm:pi-deepseek-search` then install `npm:prime-deepseek-search`.
- Pi + `prime-deepseek-search`: the SKILL.md loads but Pi has no Python-kernel skill runner, so
  the search instructions can't execute. Fix: `pi remove npm:prime-deepseek-search` then
  `pi install npm:pi-deepseek-search`.

### Why not one package with both?

Both clients read all four `pi.*` manifest fields (`extensions`, `skills`, `prompts`, `themes`),
and neither supports conditional loading — so a single package would hand Pi the skill and
Prime Agent the tool. Two packages is the only clean separation.
