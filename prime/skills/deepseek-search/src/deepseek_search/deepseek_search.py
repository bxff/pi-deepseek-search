"""DeepSeek server-side web search for Prime Agent (Anthropic-compatible endpoint).

Faithful port of the pi-deepseek-search extension (github.com/bxff/pi-deepseek-search)
into a kernel-callable Prime Agent skill, exposed as ``await deepseek_search(query)``, with the same API contract as the
built-in Serper-based websearch skill.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import re

# DeepSeek's Anthropic-compatible endpoint; the only server tool it supports.
_ANTHROPIC_BASE = "https://api.deepseek.com/anthropic"
_SEARCH_TOOL_TYPE = "web_search_20260209"  # older alias: web_search_20250305
_DEFAULT_MODEL = "deepseek-v4-flash"
_DEFAULT_MAX_TOKENS = 4096
_DEFAULT_TIMEOUT = 60
_MAX_SOURCES = 50


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def _agent_dir() -> Path:
    raw = (
        os.environ.get("PRIME_AGENT_CODING_AGENT_DIR")
        or os.environ.get("PI_CODING_AGENT_DIR")
        or str(Path.home() / ".prime" / "agent")
    )
    return Path(raw).expanduser()


def _resolve_config_value(value: str) -> str:
    value = value.strip()
    if not value or value.startswith("!"):
        return ""
    return (os.environ.get(value) or value).strip()


def _resolve_api_key() -> str:
    """DeepSeek API key from DEEPSEEK_API_KEY env or auth.json (deepseek provider)."""
    env_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        auth = json.loads((_agent_dir() / "auth.json").read_text())
        cred = auth.get("deepseek") if isinstance(auth, dict) else None
        if isinstance(cred, dict) and cred.get("type") == "api_key":
            return _resolve_config_value(str(cred.get("key") or ""))
    except (OSError, ValueError):
        pass
    return ""


def _format_sources(sources: list[dict]) -> str:
    if not sources:
        return ""
    lines = ["", "Links:"]
    for i, s in enumerate(sources, start=1):
        title = s.get("title") or "Untitled"
        url = s.get("url") or ""
        age = s.get("page_age")
        lines.append(f"{i}. [{title}]({url})" + (f" ({age})" if age else ""))
    return "\n".join(lines)


async def _deepseek_search(
    query: str,
    api_key: str,
    *,
    timeout: int,
    model: str,
    allowed_domains: list[str] | None = None,
    blocked_domains: list[str] | None = None,
) -> str:
    """Run a DeepSeek server-side web search; return formatted answer + sources."""
    tool: dict = {"type": _SEARCH_TOOL_TYPE, "name": "web_search", "max_uses": 8}
    if allowed_domains:
        tool["allowed_domains"] = allowed_domains
    if blocked_domains:
        tool["blocked_domains"] = blocked_domains

    body = {
        "model": model,
        "max_tokens": _DEFAULT_MAX_TOKENS,
        "messages": [{"role": "user", "content": query}],
        "system": "You are an assistant for performing a web search tool use. Do not output tool call syntax.",
        "tools": [tool],
        "stream": True,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    answer_parts: list[str] = []
    sources: list[dict] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", f"{_ANTHROPIC_BASE}/v1/messages", json=body, headers=headers
        ) as resp:
            if resp.status_code != 200:
                detail = resp.reason_phrase or f"HTTP {resp.status_code}"
                try:
                    err = resp.json()
                    detail = (err.get("error") or {}).get("message") or detail
                except Exception:
                    pass
                raise RuntimeError(f"DeepSeek API {resp.status_code}: {detail}")
            async for raw_line in resp.aiter_lines():
                line = raw_line.rstrip()
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    continue
                try:
                    event = json.loads(data)
                except ValueError:
                    continue
                etype = event.get("type")
                if etype == "content_block_start":
                    block = event.get("content_block") or {}
                    if block.get("type") == "web_search_tool_result" and isinstance(
                        block.get("content"), list
                    ):
                        for entry in block["content"]:
                            if entry.get("type") == "web_search_result":
                                if len(sources) >= _MAX_SOURCES:
                                    break
                                sources.append(
                                    {
                                        "title": entry.get("title") or "Untitled",
                                        "url": entry.get("url") or "",
                                        "page_age": entry.get("page_age"),
                                    }
                                )
                elif etype == "content_block_delta":
                    delta = event.get("delta") or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        if answer_parts:
                            answer_parts[-1] += delta["text"]
                        else:
                            answer_parts.append(delta["text"])


    answer = (
        "\n\n".join(part.strip() for part in answer_parts if part.strip())
        or f"No results for: {query}"
    )
    # Defensive cleanup mirroring the original extension: strip model-emitted
    # tool-call syntax and collapse excessive blank lines.
    answer = re.sub(r"<[^>]*(?:tool_calls|invoke|parameter)[^>]*>", "", answer)
    answer = re.sub(r"\n{3,}", "\n\n", answer).strip()
    return answer + _format_sources(sources)


async def run(
    query: str,
    *,
    max_output: int = 8192,
    timeout: int | None = None,
    num_results: int | None = None,
    model: str | None = None,
    allowed_domains: list[str] | None = None,
    blocked_domains: list[str] | None = None,
) -> str:
    """Run a web search via DeepSeek server-side search and return formatted results.

    Args:
        query: The search query.
        max_output: Truncate output to this many chars.
        timeout: HTTP timeout in seconds.
        num_results: Accepted for API compatibility with the Serper skill; DeepSeek
            returns a synthesized answer plus sources instead of ranked results.
        model: DeepSeek model to run the search with (default from
            DEEPSEEK_SEARCH_MODEL or deepseek-v4-flash).
        allowed_domains: Restrict results to these domains (cannot combine with
            blocked_domains).
        blocked_domains: Exclude these domains (cannot combine with allowed_domains).

    Returns:
        Formatted search results.
    """
    if not query.strip():
        return "Error: query is required."
    if allowed_domains and blocked_domains:
        return "Error: allowed_domains and blocked_domains cannot be combined."

    api_key = _resolve_api_key()
    if not api_key:
        return (
            "Web search is not set up yet: no DeepSeek API key is configured.\n"
            "Tell the user how to enable it:\n"
            "  1. Run /login in Prime Agent and add their DeepSeek key (provider: deepseek).\n"
            "Do not ask them to set environment variables. Once the key is saved, web search works automatically."
        )

    if timeout is None:
        timeout = _env_int("PRIME_AGENT_WEBSEARCH_TIMEOUT", _DEFAULT_TIMEOUT)
    if model is None:
        model = os.environ.get("DEEPSEEK_SEARCH_MODEL", "").strip() or _DEFAULT_MODEL

    try:
        result = await _deepseek_search(
            query,
            api_key,
            timeout=timeout,
            model=model,
            allowed_domains=allowed_domains,
            blocked_domains=blocked_domains,
        )
    except Exception as e:
        result = f"Error searching for '{query}': {e}"

    output = f'Results for query "{query}":\n\n{result}'

    if len(output) > max_output:
        total = len(output)
        marker = f"\n... [output truncated, {total} chars total] ...\n"
        half = max(0, (max_output - len(marker)) // 2)
        output = output[:half] + marker + output[len(output) - half :]
        if len(output) > max_output:
            output = output[:max_output]

    return output
