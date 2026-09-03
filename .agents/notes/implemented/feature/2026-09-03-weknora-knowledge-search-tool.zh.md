# Agent Note: WeKnora knowledge-search 工具

Status: implemented

[English](2026-09-03-weknora-knowledge-search-tool.md) | 中文

## 问题

Harness 部署需要一种方式，让对话模型能够从 WeKnora 检索私有项目知识，同时仍由 Harness 拥有 turn loop（轮次循环）、工具路由、session log（会话日志）、压缩与安全策略。WeKnora 也公开 agent 风格的 endpoint（端点），但如果第一版集成使用这些端点，就会形成 agent 背后再套一个 agent，导致指令、记忆、工具决策和答案综合的归属不清。

集成还必须避免把 WeKnora API key 写入源码或提交配置。局部诊断脚本可以包含用于人工测试的 key，但交付包需要逐调用解析凭据，并提供不依赖凭据可用性的稳定模型 schema。

## 决策

`@deepseek-ai/dsh-tool-weknora` 作为 opt-in 面向模型工具包交付，位于 `packages/web/tool-weknora`。它注册 `knowledge_search`，贡献一个系统提示词指引段，并直接调用 WeKnora 的 `POST /api/v1/knowledge-search` endpoint。工具名使用对标识符友好的下划线形式，因为模型通过工具注册表接收函数名；产品文案可以把该能力称为 “knowledge-search”。

本包要求部署提供 `baseURL`，并接受默认 `knowledgeBaseIds`。工具调用提供非空 `query`，可以覆盖 `knowledge_base_ids`，也可以在部署的 `maxTopK` 范围内设置 `top_k`。配置或调用两者至少要提供一个知识库 ID。HTTP 请求从已挂载的 credentials service（凭据服务）调用 `ctx.credentials.resolve(WEKNORA_API_KEY)` 获取 `X-API-Key`，否则从 `launchEnvironmentOf(ctx)` 获取。缺失凭据会在 dispatch（分发）前失败。

响应投影接受常见 WeKnora 形状，例如顶层数组、`{ data: [...] }` 或嵌套的 `{ data: { results: [...] } }`，并输出有界规范结果：`content`、可选 `title`、`source`、`score`、`knowledgeBaseId` 与 `documentId`。渲染结果以外部不可信内容提示开头，并要求模型在存在 source link（来源链接）或 document name（文档名）时引用它们。本工具不进入共享 `ctx.web` 提供方选择服务，因为 WeKnora 知识库搜索是经过认证的私有检索，而不是公共 web 搜索或匿名 URL 抓取。

## 后果

Harness 保留对话策略与会话语义，WeKnora 只拥有其知识库上的检索。第一版集成足够小，可以通过 profile patch（配置补丁）启用并用本地 HTTP stub 测试，也能加入选定会话而不改变 base bundle（基础组合包）。

部署必须知道或配置 WeKnora 知识库 ID；通过 `GET /api/v1/knowledge-bases` 发现知识库被刻意留给未来工具。受保护的 WeKnora resource handle（资源句柄）会作为 source 文本返回，除非 WeKnora 用 `resource_urls=public` 重写它们；抓取受保护资源不属于本包。

## 测试

`packages/web/tool-weknora/tests/tool-weknora.spec.ts` 挂载真实的 `SystemPrompt` 与 `ToolRuntime` 服务和新插件，并用本地 HTTP server 作为 WeKnora 边界。测试验证发送的 method、endpoint、API key header、body、参数覆盖行为、模型可见的不可信内容渲染、结果 metadata（元数据），以及缺失 key 时在分发前失败的行为。

## 曾考虑的替代方案

**代理到 WeKnora 的 agent endpoint。** 第一版否决，因为这会把对话策略嵌套进另一套对话策略。Harness 仍必须决定如何调和内层 agent 的指令、工具调用、引用、记忆、日志与失败处理，而用户明确要的是 knowledge-search 工具。

**把 WeKnora 加成 `ctx.web` provider（提供方）。** 否决，因为 web service 拥有公共搜索/抓取的提供方选择。WeKnora 知识库检索带认证、由私有知识库 ID 配置，并返回文档片段而不是公共 web source，因此复用 `web_search` 会模糊工具约定。

**同时注册 `knowledge_list`。** 推迟，因为请求的能力是 search，第一版包应保持模型表面窄。列出知识库对配置和后续自服务有用，但它扩大了带凭据的 metadata 暴露，需要自己的模型指引。
