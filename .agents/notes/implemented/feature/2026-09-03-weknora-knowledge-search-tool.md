# Agent Note: WeKnora knowledge-search tool

Status: implemented

English | [中文](2026-09-03-weknora-knowledge-search-tool.zh.md)

## Problem

Harness deployments need a way for the conversation model to retrieve private project knowledge from WeKnora while preserving Harness ownership of the turn loop, tool routing, session log, compaction, and safety policies. WeKnora also exposes agent-style endpoints, but using them as the first integration would put an agent behind another agent and make it unclear which system owns instructions, memory, tool decisions, and answer synthesis.

The integration must also avoid putting a WeKnora API key in source or committed configuration. A local diagnostic script may contain a key for manual testing, but the shipped package needs per-call credential resolution and a stable model-facing schema independent of credential availability.

## Decision

`@deepseek-ai/dsh-tool-weknora` ships as an opt-in model-facing tool package under `packages/web/tool-weknora`. It registers `knowledge_search`, contributes one system-prompt guidance section, and directly calls WeKnora's `POST /api/v1/knowledge-search` endpoint. The tool name uses an identifier-safe underscore form because models receive function names through the tool registry; product prose may call the feature "knowledge-search".

The package requires a deployment `baseURL` and accepts default `knowledgeBaseIds`. A tool call supplies a non-empty `query`, may override `knowledge_base_ids`, and may set `top_k` within the deployment's `maxTopK`. At least one knowledge-base ID must come from either config or the call. The HTTP request sets `X-API-Key` from `ctx.credentials.resolve(WEKNORA_API_KEY)` when the credentials service is mounted, otherwise from `launchEnvironmentOf(ctx)`. Missing credentials fail before dispatch.

The response projection accepts common WeKnora shapes such as a top-level array, `{ data: [...] }`, or nested `{ data: { results: [...] } }`, and emits bounded canonical results with `content`, optional `title`, `source`, `score`, `knowledgeBaseId`, and `documentId`. Rendered output starts with an external-untrusted-content notice and asks the model to cite source links or document names when present. The tool stays out of the shared `ctx.web` provider-selection service because WeKnora knowledge-base search is authenticated private retrieval, not public web search or anonymous URL fetching.

## Consequences

Harness retains the conversation policy and session semantics while WeKnora owns retrieval over its knowledge bases. The first integration is small enough to configure in a profile patch and test with a local HTTP stub, and it can be added to selected sessions without changing the base bundle.

Deployments must know or configure WeKnora knowledge-base IDs; discovery through `GET /api/v1/knowledge-bases` is deliberately left for a future tool. Protected WeKnora resource handles are returned as source text unless WeKnora rewrites them with `resource_urls=public`; fetching protected resources remains outside this package.

## Testing

`packages/web/tool-weknora/tests/tool-weknora.spec.ts` mounts real `SystemPrompt` and `ToolRuntime` services with the new plugin and uses a local HTTP server as the WeKnora boundary. The tests verify the posted method, endpoint, API key header, body, argument override behavior, model-visible untrusted-content rendering, result metadata, and missing-key-before-dispatch behavior.

## Alternatives considered

**Proxying to WeKnora's agent endpoints.** Rejected for the first integration because it nests dialogue policy inside dialogue policy. Harness would still have to decide how to reconcile instructions, tool calls, citations, memory, logging, and failure handling from the inner agent, while the user asked for a knowledge-search tool.

**Adding WeKnora as a `ctx.web` provider.** Rejected because the web service owns public search/fetch provider selection. WeKnora knowledge-base retrieval is authenticated, configured by private knowledge-base IDs, and returns document snippets rather than public web sources, so sharing `web_search` would blur the tool contract.

**Registering `knowledge_list` together with search.** Deferred because the requested capability is search and the first package should keep the model surface narrow. Listing knowledge bases is useful for setup and later self-service, but it expands credentialed metadata exposure and needs its own model guidance.
