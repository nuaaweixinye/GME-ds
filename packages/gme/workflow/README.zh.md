---
description: "在 Harness 中操作 GME Test Agent 工作流，保留 Python 后端和 Codex 执行引擎。"
kind: "package-reference"
---

# @deepseek-ai/dsh-gme-workflow

[English](README.md) | 中文

## 概要

这个可选插件让 Harness 查询接口、创建和扩展测试任务、构建、运行测试、审计内存、修复已有失败并提交 PR。代码生成与修复仍由 Codex 执行。插件不依赖或加载 `tool-gme`。

## 使用方式

需要现有 GME Test Agent 源码目录、Python 依赖、已配置的 GME 仓库、编译工具和 Codex 登录状态。插件使用 `backend/run_backend.py`、`config.local.json` 和现有任务数据库，不复制 Python 应用，也不启动 Vue 网页。

在 Harness 源码工作区中构建并安装：

```powershell
pnpm exec tsc -b packages/gme/workflow
pnpm exec tsdown --filter '@deepseek-ai/dsh-gme-workflow'
$env:GME_TEST_AGENT_ROOT = 'D:/workspace/gme-test-agent'
$env:GME_TEST_AGENT_PYTHON = 'C:/ProgramData/Miniconda3/envs/agent/python.exe'
pnpm dsh plugin --profile web link ./packages/gme/workflow
pnpm dsh web
```

启动 Harness 时需要这些环境变量。也可以在 profile 的补丁文件中用以下完整配置覆盖 `gme-workflow`：

```yaml
- id: gme-workflow
  config:
    backendRoot: D:/workspace/gme-test-agent
    pythonPath: C:/ProgramData/Miniconda3/envs/agent/python.exe
    port: 8765
    autoStart: true
```

需要基于 base、含有 `tools` 和 `systemPrompt` 的 profile；自动启动还需要本机 `subprocess` 服务。如果旧 profile 另外启用了 `tool-gme`，需在该 profile 中禁用已有条目；安装此插件不会删除其他包。

### 操作

| 工具 | 功能 |
|---|---|
| `gme_workflow_query` | 查询健康状态、环境、接口目录、任务、增量日志、测试结果、产物、失败与观测记录 |
| `gme_workflow_create` | 创建单个测试任务、按接口批量创建任务，或修复选中的失败 |
| `gme_workflow_action` | 扩展、重试、构建、运行测试、内存审计、删除选中测试、清理工作区、删除任务 |
| `gme_workflow_submit` | 提交任务 PR、已知失败 skip PR 或选中测试 PR |

创建和扩展测试时，使用接口目录的 `interface_ids` 或自由描述的 `goal`，不能同时提供。现有后端在选择接口后会覆盖自由提示词，插件会拒绝这种组合。批量创建必须使用接口 ID。选择前先查询目录，任务操作使用后端任务 ID，而非 Harness 会话 ID。

创建和操作可能返回 `accepted: true`，仅表示已排队，不能当成验证通过。继续查询任务和测试结果。报告返回 `content`（JSON 序列化文本的片段）、`total_characters` 和 `next_offset`；用该 offset 重复同一查询即可继续读取。动态列表在分页期间可能变化；实时日志用 `events.after` 增量查询，稳定报告读取已完成任务产物。基础设施故障会返回工具错误；查询到 `status: failed` 的任务是正常业务结果。

### 后台进程与凭据

首次请求先通过带身份验证的健康检查复用已有后端；没有后端且 `autoStart: true` 时，启动配置的 Python 入口。并发请求共享启动过程。身份验证失败或端口上存在其他服务时直接报错。凭据从 `tokenFile` 读取，默认是 `logs/web-api-token.log`；自动启动会创建缺失的 token 文件。工具参数不包含凭据。托管子进程只显式传入 API token，Codex 通常使用已有本机登录状态。

卸载插件只终止它自己启动的后端及子进程。因此关闭或重载 Harness 可能中断托管任务；独立启动的后端会保留。托管后端退出后，下一次请求可重新启动它，但不会自动重试中断的任务。取消工具等待不会取消已提交的后台任务。POST 请求不会自动重发；提交结果不明确时，先查询任务再决定是否重试。

## 模型体验

### 指引与工具定义

#### 模型可见内容

参见规范[工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-gme-workflow)。四个工作流工具定义和一段项目指引进入请求前缀。指引区分已接收与验证通过、将报告视为数据，并要求提交 PR、skip 和清理遵循用户意图。部署路径与凭据不会进入工具定义。

#### Token 影响

工具定义与指引占用固定的请求开销。每页正文受 `pageChars` 限制，默认 12,000 字符，最高 50,000 字符，外层结果字段另占少量空间。HTTP 响应受 `maxResponseBytes` 限制，默认 8 MiB。

#### KV Cache 影响

工具定义和指引未变化时前缀保持稳定。工具结果追加到对话与持久化会话日志。

### 展示

#### 模型可见内容

使用 Harness 现有通用工具卡片展示操作和序列化结果，不包含专门的任务仪表盘。

#### Token 影响

展示不会在结果字段之外额外添加模型文本。

#### KV Cache 影响

展示不改变模型请求前缀。

## 已知限制与后续工作

- 仍需要现有 Python 项目和已配置的本机 GME 编译环境。
- 后端没有任务取消接口，也没有进程重启后的任务自动恢复。
- PR 和清理沿用后端规则及用户指令，不增加额外确认弹窗。
- 自由描述任务沿用后端的自由选择与验证行为。
- 大报告采用字符分页，不是不可变快照或结构化表格。

### 开发说明

`src/backend.ts` 管理身份验证、HTTP 和后台进程；`src/index.ts` 管理工具定义、路由与结果展示。插件不复制后端持久化任务状态，因此不提供 invariant companion；进程生命周期和 Loader 测试负责验证本地行为。参见[设计决策](../../../.agents/notes/implemented/feature/2026-09-12-gme-workflow-plugin.zh.md)。
