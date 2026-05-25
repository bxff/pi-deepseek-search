---
title: "Using DeepSeek's undocumented web search in Pi"
date: 2026-05-25
tags: ["coding-agent", "open-source", "typescript"]
toc: false
type: post
---

Pi doesn't come with web search out of the box, which is the whole point since it's built to be customized, but you do have to wire it up yourself.

![pi install npm:pi-deepseek-search](/demo.gif)

```bash
pi install npm:pi-deepseek-search
```

Codex search genuinely impressed me. It finds things other agents miss, and since Pi is built around customization I wanted that level of search in my setup. The problem is that getting it into Pi through [pi-codex-search](https://github.com/Leechael/pi-codex-search) means hooking into your ChatGPT subscription via the Codex API, and my usage started draining way faster than it should have, so I dug into the source to see why. The core of it looks like this:

```typescript
// pi-codex-search/src/codex.ts
function buildWebSearchRequestBody(options: CodexWebSearchOptions) {
  return {s
    model: options.model,                    // defaults to your account model
    instructions: "You are a concise web search assistant...",
    input: [{ type: "message", role: "user", content: [query] }],
    tools: [{ type: "web_search" }],
    tool_choice: "required",                 // forces model invocation
    store: false,                            // doesn't save to history
    stream: true,
  };
}
```

Every search triggers a full model call on your default model, GPT-5.5 for most people, and since the model still processes the whole request you are paying top-tier rates just to search the web. That got me wondering whether DeepSeek, which I was already using for cheap inference, might have something similar running on their own infrastructure.

## How I found the endpoint

DeepSeek launched V4 Pro and V4 Flash with a 4x price slash from day one, which was supposed to end in May but they made it permanent instead. The model is good enough for what I need, doing most of what I used Opus 4.6 for just slower, and I ran about a billion tokens through DeepSeek V4 Pro in one week and paid around $15, mostly because the cache hit rate was ridiculous. DeepSeek also does not care what coding agent you use, which is nice.

I was testing different coding agents and noticed Claude Code's search still worked even though I was routing through DeepSeek, so I assumed it was falling back to my Anthropic account, then checked and realized I had no active session there, and DeepSeek was running the search itself.

DeepSeek has two API endpoints: Pi uses the OpenAI-compatible one, but DeepSeek also runs an Anthropic-compatible endpoint at `api.deepseek.com/anthropic` for tools like Claude Code, and their docs [say](https://api-docs.deepseek.com/guides/anthropic_api) `web_search_tool_result` and `server_tool_use` are not supported.

I knew Anthropic's API has `web_search_20250305` and `web_search_20260209` as server-side tool types from how Claude Code implements search, and you can see the official Anthropic docs on this [here](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). I sent both to DeepSeek's Anthropic endpoint and got real results back with titles, URLs, and `encrypted_content` fields, so I tried the other server-side tools Anthropic defines just to check if anything else was available, code execution, computer use, text editing, but none of them worked on DeepSeek, only the two web search variants did.

You cannot read the encrypted content yourself, only the model decrypts it in the session, which DeepSeek copied from Anthropic's API design, so you see titles and URLs while the model sees the full text, and you get a summary with source links. If you watch the stream you can see how many searches the model runs before results come back, which matches chat.deepseek.com exactly so I think it is the same backend.

I tested the parameters from Claude Code's tool format for reference, not because I was planning to use them all but just to see what carried over, and five of six mapped over, `max_uses`, `search_context_size`, `allowed_domains`, `blocked_domains`, `user_location`, while `tool_choice` got rejected because DeepSeek will not let you force a specific tool call, and they also rejected `temperature`, `top_p`, and `metadata`, so six total, five work.

## What the extension does

It redirects search calls from DeepSeek's OpenAI endpoint to their Anthropic one because `web_search_20260209` only lives there, then registers the tool type with Pi so the model can call it during inference, and DeepSeek runs the search on their servers and returns results inline through the same stream.

External search extensions work differently, hitting a separate API like Exa or Brave, pulling results, and injecting them into context, while server-side search means DeepSeek handles it internally during the model call. The model still gets results as a tool response but the search runs on DeepSeek's servers rather than a third party, and this only works with DeepSeek models.

It is not obvious that you can use Anthropic's web search tool types on DeepSeek's Anthropic endpoint. DeepSeek's own documentation says these are unsupported and most server-side tools are, but web search works anyway, which is undocumented and easy to miss, and that was part of why I built a separate extension rather than patching an existing one. I wanted something that explicitly targets this quirk and does not pretend the other Anthropic tools work.

I skipped web_fetch because Claude Code does that client-side and it should be its own extension, since search and fetch are different problems anyway.

## Why I did not use what already existed

[@wierdbytes/pi-web](https://pi.dev/packages/@wierdbytes/pi-web) does the same thing through Anthropic's endpoint and I could have pointed it at DeepSeek, but it is 3,000 lines bundling web_fetch with a browser pipeline, config UI, and sub-agent summarization, and I wanted something smaller that only does search and acknowledges the DeepSeek-specific behavior upfront.

<figure class="m-0 border-solid border-1 border-brand rounded-1">
  <img src="/pi-package-banner.png" alt="pi-deepseek-search" class="block w-full" />
  <figcaption class="p-3 font-size-2 text background-brand">
    <a class="link" href="https://pi.dev/packages/pi-deepseek-search">pi-deepseek-search on pi.dev</a>
  </figcaption>
</figure>

<style>
  pre code { white-space: pre; word-wrap: normal; overflow-x: auto; }
</style>
