# prime-deepseek-search

Native web search for **Prime Agent** using DeepSeek's server-side search
(`web_search_20260209` via the Anthropic-compatible endpoint). It ships a **skill** — a
kernel-callable function — not an extension tool.

**This package is for Prime Agent only.** Pi users should install
[`pi-deepseek-search`](https://www.npmjs.com/package/pi-deepseek-search) instead.
See also: [GitHub](https://github.com/bxff/pi-deepseek-search) ·
[pi.dev](https://pi.dev/packages/prime-deepseek-search)

## Install

```bash
prime-agent package install npm:prime-deepseek-search
```

Installs for the current user (global). For a single project only, add `--local`.

## Usage

Provides the `deepseek-search` skill — call it from the IPython kernel:

```python
import deepseek_search
print(await deepseek_search("latest OpenUSD security advisories"))
```

Optional kwargs: `model`, `allowed_domains`, `blocked_domains`, `max_output`, `timeout`
(`num_results` is accepted for Serper-API compatibility and ignored).
Env overrides: `DEEPSEEK_SEARCH_MODEL`, `PRIME_AGENT_WEBSEARCH_TIMEOUT`.

No extra API keys: reads the DeepSeek key saved by `/login` (provider `deepseek`).
Only works with DeepSeek models (the search runs on DeepSeek's servers during inference).

The skill **coexists** with Prime Agent's bundled Serper `websearch` skill — it does not
override it.

## Installed the wrong one?

- On **Pi** instead of Prime Agent: Pi loads the SKILL.md as a markdown skill but has no
  Python-kernel skill runner, so the search instructions can't execute. Fix:
  `pi remove npm:prime-deepseek-search` then `pi install npm:pi-deepseek-search`.
- Installed `pi-deepseek-search` on Prime Agent by mistake: you get the `web_search` tool
  instead of the kernel skill. Fix:
  `prime-agent package remove npm:pi-deepseek-search` then
  `prime-agent package install npm:prime-deepseek-search`.

## Manage

```bash
prime-agent package list                  # see installed packages
prime-agent package update                # update all installed packages
prime-agent package remove npm:prime-deepseek-search   # uninstall
```

Note: after `package remove`, Prime Agent re-enables its bundled Serper `websearch` skill on
the next start (removing a package never uninstalls skill packages from the kernel venv, so
nothing breaks — a stale Python package may remain harmlessly).

## License

MIT
