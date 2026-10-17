import asyncio
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/deepseek-search/src"))
skill = importlib.import_module("deepseek_search.deepseek_search")


def mock_client(handler):
    client = httpx.AsyncClient
    return patch.object(
        skill.httpx,
        "AsyncClient",
        side_effect=lambda **kw: client(transport=httpx.MockTransport(handler), **kw),
    )


class SearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        env = patch.dict(
            os.environ, {"DEEPSEEK_API_KEY": "test-key", "DEEPSEEK_SEARCH_BACKEND": "api"}
        )
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("PRIME_AGENT_WEBSEARCH_TIMEOUT", None)

    async def test_direct_search_body_auth_links_and_cost(self):
        def handler(request):
            self.assertEqual(str(request.url), "https://api.deepseek.com/v1/tools/search")
            self.assertEqual(request.headers["authorization"], "Bearer test-key")
            self.assertEqual(
                json.loads(request.content),
                {
                    "query": "DeepSeek site:deepseek.com OR site:example.org",
                    "count": 3,
                },
            )
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"title": "DeepSeek", "url": "https://deepseek.com", "summary": "Summary"},
                    ]
                },
            )

        with mock_client(handler):
            result = await skill.run(
                "DeepSeek", num_results=3, allowed_domains=["deepseek.com", "example.org"]
            )
        self.assertIn("[DeepSeek](https://deepseek.com)", result)
        self.assertIn("Summary", result)
        self.assertIn("$0.00075 estimated", result)

    async def test_validation_prevents_requests(self):
        with mock_client(lambda request: self.fail("Invalid input made a request")):
            for args in [
                {"query": " "},
                {"query": "x" * 129},
                {"query": "x", "num_results": 51},
                {"query": "x", "num_results": True},
                {"query": "x", "timeout": -1},
                {"query": "x", "max_output": 0},
                {"query": "x", "allowed_domains": ["https://example.org"]},
                {"query": "x", "allowed_domains": ["a.org"], "blocked_domains": ["b.org"]},
            ]:
                self.assertTrue((await skill.run(**args)).startswith("Search failed:"))
            for url in [
                "file:///etc/passwd",
                "https://user:pass@example.org",
                "https://a.org/" + "x" * 8192,
            ]:
                self.assertTrue((await skill.fetch(url)).startswith("Fetch failed:"))

    async def test_empty_and_malformed_results(self):
        with mock_client(lambda r: httpx.Response(200, json={"results": []})):
            result = await skill.run("no results")
            self.assertIn("No results", result)
            self.assertIn("$0.00000 estimated", result)
        with mock_client(lambda r: httpx.Response(200, json={"results": "invalid"})):
            self.assertIn("invalid results payload", await skill.run("test"))

    async def test_fetch_markdown_empty_cost_and_output_limit(self):
        def handler(request):
            self.assertEqual(str(request.url), "https://api.deepseek.com/v1/tools/fetch")
            self.assertEqual(json.loads(request.content), {"url": "https://example.org/article"})
            return httpx.Response(
                200, json={"title": "Article", "content": "# Article\n\n" + "Text " * 200}
            )

        with mock_client(handler):
            result = await skill.fetch("https://example.org/article", max_output=160)
        self.assertLessEqual(len(result), 160)
        self.assertIn("output truncated", result)
        self.assertIn("$0.00075 estimated", result)
        with mock_client(lambda r: httpx.Response(200, json={"title": "", "content": ""})):
            self.assertIn("$0.00000 estimated", await skill.fetch("https://example.org"))

    async def test_server_sources_are_grounded_and_fetch_stays_standalone(self):
        os.environ["DEEPSEEK_SEARCH_BACKEND"] = "server"

        def handler(request):
            if request.url.path.endswith("/fetch"):
                return httpx.Response(200, json={"title": "Page", "content": "Markdown"})
            self.assertEqual(str(request.url), "https://api.deepseek.com/anthropic/v1/messages")
            self.assertEqual(request.headers["x-api-key"], "test-key")
            body = json.loads(request.content)
            self.assertEqual(body["model"], "custom-model")
            self.assertIn("-site:ads.org", body["messages"][0]["content"])
            self.assertEqual(body["thinking"], {"type": "disabled"})
            self.assertEqual(body["tools"][0]["max_uses"], 5)
            source = {"type": "web_search_result", "title": "Real", "url": "https://example.org"}
            return httpx.Response(
                200,
                json={
                    "model": "custom-model",
                    "content": [
                        {
                            "type": "text",
                            "text": "Invented https://fake.example",
                            "citations": [
                                {"url": "https://example.org", "cited_text": "Grounded excerpt"},
                            ],
                        },
                        {"type": "web_search_tool_result", "content": [source, source]},
                    ],
                    "usage": {"input_tokens": 100, "output_tokens": 20},
                },
            )

        with mock_client(handler):
            result = await skill.run("test", model="custom-model", blocked_domains=["ads.org"])
            fetched = await skill.fetch("https://example.org")
        self.assertEqual(result.count("[Real]"), 1)
        self.assertIn("Grounded excerpt", result)
        self.assertNotIn("fake.example", result)
        self.assertIn("120 tokens", result)
        self.assertNotIn("estimated", result)
        self.assertIn("Markdown", fetched)

    async def test_native_tool_errors_are_not_successful_searches(self):
        os.environ["DEEPSEEK_SEARCH_BACKEND"] = "server"
        for content, expected in [
            ([{"type": "text", "text": "No search"}], "did not perform"),
            ([{"type": "web_search_tool_result", "content": {"error_code": "blocked"}}], "blocked"),
        ]:
            with mock_client(
                lambda r, content=content: httpx.Response(200, json={"content": content})
            ):
                self.assertIn(expected, await skill.run("test"))

    async def test_retries_transient_api_errors_but_not_403_or_model_turns(self):
        requests = []

        def handler(request):
            requests.append(request)
            if len(requests) == 1:
                return httpx.Response(
                    429, headers={"retry-after": "0"}, json={"error": {"message": "rate limited"}}
                )
            return httpx.Response(200, json={"results": []})

        with mock_client(handler):
            await skill.run("test")
        self.assertEqual(len(requests), 2)
        for backend in ["api", "server"]:
            os.environ["DEEPSEEK_SEARCH_BACKEND"] = backend
            calls = []

            status = 500 if backend == "server" else 403

            def reject(request, calls=calls, status=status):
                calls.append(request)
                return httpx.Response(status, json={"error": {"message": "blocked"}})

            with mock_client(reject):
                self.assertIn(f"{status}: blocked", await skill.run("test"))
            self.assertEqual(len(calls), 1)

    async def test_cancellation_propagates(self):
        async def handler(request):
            raise asyncio.CancelledError()

        with mock_client(handler), self.assertRaises(asyncio.CancelledError):
            await skill.run("test")

    async def test_custom_timeout_bounds_the_request(self):
        requests = []

        async def handler(request):
            requests.append(request)
            await asyncio.Event().wait()

        os.environ["DEEPSEEK_SEARCH_BACKEND"] = "server"
        with mock_client(handler):
            result = await skill.run("test", timeout=0.001)
        self.assertIn("timed out after 0.001 seconds", result)
        self.assertEqual(len(requests), 1)

    async def test_auth_reads_new_keys_each_call_and_reports_missing_key(self):
        os.environ.pop("DEEPSEEK_API_KEY", None)
        with tempfile.TemporaryDirectory() as directory:
            os.environ["PRIME_AGENT_CODING_AGENT_DIR"] = directory
            auth = Path(directory) / "auth.json"
            keys = []

            def handler(request):
                keys.append(request.headers["authorization"])
                return httpx.Response(200, json={"results": []})

            with mock_client(handler):
                for key in ["first-key", "second-key"]:
                    auth.write_text(json.dumps({"deepseek": {"type": "api_key", "key": key}}))
                    await skill.run("test")
                auth.unlink()
                self.assertIn("/login", await skill.run("test"))
            self.assertEqual(keys, ["Bearer first-key", "Bearer second-key"])


if __name__ == "__main__":
    unittest.main()
