"""DeepSeek Search and Fetch for Prime Agent's persistent Python kernel."""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

import httpx

_API_BASE = "https://api.deepseek.com/v1/tools"
_SERVER_URL = "https://api.deepseek.com/anthropic/v1/messages"
_REQUEST_PRICE = 0.00075


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


def _search_query(query: str, allowed: list[str] | None, blocked: list[str] | None) -> str:
    if not isinstance(query, str) or not query.strip() or len(query) > 128:
        raise ValueError("query must contain 1 to 128 Unicode characters and cannot be blank.")
    if allowed and blocked:
        raise ValueError("allowed_domains and blocked_domains cannot be combined.")
    pattern = r"(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?"
    for domains in (allowed, blocked):
        if domains is not None and (
            not isinstance(domains, list)
            or any(
                not isinstance(d, str)
                or len(d) > 253
                or not re.fullmatch(pattern, d, re.IGNORECASE)
                for d in domains
            )
        ):
            raise ValueError(
                "Domain filters must contain plain domain names without schemes or paths."
            )
    query = query.strip()
    if allowed:
        query += " site:" + " OR site:".join(allowed)
    if blocked:
        query += " " + " ".join(f"-site:{d}" for d in blocked)
    if len(query) > 128:
        raise ValueError("query with domain filters must be at most 128 Unicode characters.")
    return query


def _timeout(value: int | None, default: int) -> float:
    value = _env_int("PRIME_AGENT_WEBSEARCH_TIMEOUT", default) if value is None else value
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value <= 0
    ):
        raise ValueError("timeout must be a positive number of seconds.")
    return value


def _key() -> str:
    key = _resolve_api_key()
    if not key:
        raise ValueError(
            "No DeepSeek API key found. Run /login in Prime Agent and select DeepSeek, or set DEEPSEEK_API_KEY."
        )
    return key


async def _post(
    url: str, body: dict, api_key: str, timeout: float, *, server: bool = False
) -> dict:
    headers = {"content-type": "application/json"}
    if server:
        headers.update({"x-api-key": api_key, "anthropic-version": "2023-06-01"})
    else:
        headers["authorization"] = f"Bearer {api_key}"
    attempts = 1 if server else 3
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(attempts):
            try:
                response = await asyncio.wait_for(
                    client.post(url, json=body, headers=headers), timeout=timeout
                )
            except (httpx.TimeoutException, asyncio.TimeoutError) as error:
                if attempt == attempts - 1:
                    raise RuntimeError(
                        f"DeepSeek request timed out after {timeout:g} seconds."
                    ) from error
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            if response.status_code == 200:
                return response.json()
            if (
                response.status_code in (408, 429) or response.status_code >= 500
            ) and attempt < attempts - 1:
                try:
                    wait = float(response.headers.get("retry-after", ""))
                    wait = min(max(wait, 0), 5) if math.isfinite(wait) else 0.5 * 2**attempt
                except ValueError:
                    wait = 0.5 * 2**attempt
                await asyncio.sleep(wait)
                continue
            detail = response.reason_phrase
            try:
                detail = response.json().get("error", {}).get("message") or detail
            except (ValueError, AttributeError):
                pass
            raise RuntimeError(f"DeepSeek API {response.status_code}: {detail}")
    raise RuntimeError("DeepSeek request failed.")


def _server_sources(data: dict) -> list[dict]:
    blocks = data.get("content")
    if not isinstance(blocks, list):
        raise ValueError("DeepSeek returned an invalid Messages payload.")
    results = [b for b in blocks if b.get("type") == "web_search_tool_result"]
    if not results:
        raise ValueError("DeepSeek did not perform a native web search.")
    excerpts = {}
    for block in blocks:
        for citation in block.get("citations", []):
            if citation.get("url") and citation.get("cited_text"):
                excerpts.setdefault(citation["url"], citation["cited_text"])
    sources = {}
    for block in results:
        entries = block.get("content")
        if not isinstance(entries, list):
            code = (
                entries.get("error_code", "invalid result")
                if isinstance(entries, dict)
                else "invalid result"
            )
            raise ValueError(f"DeepSeek server search failed: {code}")
        for entry in entries:
            url = entry.get("url")
            if entry.get("type") == "web_search_result" and url and url not in sources:
                sources[url] = {
                    "url": url,
                    "title": entry.get("title"),
                    "date": entry.get("page_age"),
                    "snippet": entry.get("snippet") or excerpts.get(url),
                }
    return list(sources.values())


def _format_sources(sources: list[dict]) -> str:
    sections = []
    for index, source in enumerate(sources, 1):
        url = source["url"]
        title = re.sub(r"([\\\[\]])", r"\\\1", source.get("title") or url)
        lines = [f"{index}. [{title}]({url.replace(')', '%29')})"]
        if source.get("date"):
            lines.append(source["date"])
        if source.get("summary") or source.get("snippet"):
            lines.append(source.get("summary") or source["snippet"])
        sections.append("\n".join(lines))
    return "\n\n".join(sections)


def _limit(text: str, max_output: int) -> str:
    if isinstance(max_output, bool) or not isinstance(max_output, int) or max_output < 1:
        raise ValueError("max_output must be a positive integer.")
    if len(text) <= max_output:
        return text
    marker = f"\n... [output truncated, {len(text)} chars total] ...\n"
    half = max(0, (max_output - len(marker)) // 2)
    return (text[:half] + marker + (text[-half:] if half else ""))[:max_output]


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
    """Search with a query and optional domain filters; return source links and summaries.

    num_results defaults to 10 (1–50). max_output and timeout control local output
    and HTTP limits. model applies only with DEEPSEEK_SEARCH_BACKEND=server.
    """
    try:
        _limit("", max_output)
        query = _search_query(query, allowed_domains, blocked_domains)
        count = 10 if num_results is None else num_results
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 50:
            raise ValueError("num_results must be an integer from 1 to 50.")
        backend = os.environ.get("DEEPSEEK_SEARCH_BACKEND", "api") or "api"
        if backend not in ("api", "server"):
            raise ValueError("DEEPSEEK_SEARCH_BACKEND must be api or server.")
        if backend == "server":
            data = await _post(
                _SERVER_URL,
                {
                    "model": model or os.environ.get("DEEPSEEK_SEARCH_MODEL") or "deepseek-flash",
                    "max_tokens": 4096,
                    "thinking": {"type": "disabled"},
                    "messages": [
                        {
                            "role": "user",
                            "content": f"Perform a web search using this exact query, preserving all search operators: {query}",
                        }
                    ],
                    "tools": [{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}],
                },
                _key(),
                _timeout(timeout, 60),
                server=True,
            )
            sources = _server_sources(data)[:count]
            usage = data.get("usage") or {}
            tokens = (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)
            footer = f"{tokens:,} tokens · {data.get('model') or model or 'deepseek-flash'}"
        else:
            data = await _post(
                f"{_API_BASE}/search",
                {"query": query, "count": count},
                _key(),
                _timeout(timeout, 30),
            )
            sources = data.get("results")
            if not isinstance(sources, list):
                raise ValueError("DeepSeek Search returned an invalid results payload.")
            footer = f"${_REQUEST_PRICE if sources else 0:.5f} estimated"
        body = _format_sources(sources) if sources else f"No results for: {query}"
        return _limit(f'Results for query "{query}":\n\n{body}\n\n{footer}', max_output)
    except Exception as error:
        return f"Search failed: {error}"


async def fetch(url: str, *, max_output: int = 20000, timeout: int | None = None) -> str:
    """Fetch an HTTP(S) page as Markdown using DeepSeek's standalone Fetch API."""
    try:
        _limit("", max_output)
        if not isinstance(url, str) or len(url) > 8192:
            raise ValueError("url must be an HTTP(S) URL of at most 8192 characters.")
        parsed = urlsplit(url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("url must be HTTP(S) with a host and without a username or password.")
        page = await _post(f"{_API_BASE}/fetch", {"url": url}, _key(), _timeout(timeout, 30))
        if not isinstance(page.get("title"), str) or not isinstance(page.get("content"), str):
            raise ValueError("DeepSeek Fetch returned an invalid page payload.")
        price = _REQUEST_PRICE if page["content"] else 0
        return _limit(
            f"Source: {url}\n\n{page['title'] or 'Untitled page'}\n\n{page['content']}\n\n${price:.5f} estimated",
            max_output,
        )
    except Exception as error:
        return f"Fetch failed: {error}"
