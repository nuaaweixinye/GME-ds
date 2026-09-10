---
description: "面向模型的 GME-ACIS 检查、构建、测试、接口定位和交付工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-gme

[English](README.md) | 中文

## 概述

`dsh-tool-gme` 让 Harness 直接观察当前 GME-ACIS checkout。它会在工作前验证总装仓，运行受控 CMake 和 GoogleTest 命令，从当前文件定位 C++ API，根据 CMake 推导模块影响，并检查新增生产代码是否调用调用方指定的禁用 ACIS 接口。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将它挂载到包含 `tools`、`shell` 和 `systemPrompt` 的 composition。受限 shell 还必须提供 `sandboxPolicy`；GME 命令会解析调用会话的当前模式，并把它传给每个 shell 请求：

```yaml
- name: '@deepseek-ai/dsh-tool-gme'
  config:
    projectRoot: D:/workspace/GME-ACIS
    timeoutMs: 600000
```

工作前先调用 `gme_project_status`。修改前使用 `gme_locate_api`，窄范围验证使用 `gme_build` 和 `gme_test`，提交子模块前使用 `gme_delivery_check`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

| 文件 | 职责 |
|---|---|
| [`src/project.ts`](src/project.ts) | 根目录验证和项目状态解析 |
| [`src/commands.ts`](src/commands.ts) | 受校验的 CMake 与 GoogleTest 命令生成 |
| [`src/indexer.ts`](src/indexer.ts) | 实时符号搜索与 CMake 依赖图 |
| [`src/delivery.ts`](src/delivery.ts) | unified diff 与子模块交付检查 |
| [`src/index.ts`](src/index.ts) | 工具注册、执行、schema 和渲染 |

所有外部命令都通过已挂载的 shell 服务执行，以 GME 根目录作为 workdir，并使用调用方的取消信号。

本包不发布单独的运行时不变量配套文档，因为它不拥有独立的持久事件序列。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [GME 包地图](../README.zh.md) — 工具与 profile 的所有权边界。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-gme) — 准确的模型可见 schema。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-gme) — 可接受的插件配置。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 Schema

#### 模型看到的内容

五个记录在[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-gme)中的固定 schema：`gme_project_status`、`gme_build`、`gme_test`、`gme_locate_api` 和 `gme_delivery_check`。

#### Token 影响

五个 schema 会增加固定的请求头开销；结构化结果只在调用后追加，API 匹配与 shell 输出均受实现上限约束。

#### KV Cache 影响

包配置不变时 schema 前缀保持稳定，因此调用可以复用相同的缓存请求前缀。

### GME 系统提示词

#### 模型看到的内容

系统提示词中会加入一段固定的项目规则。

##### 项目规则

```markdown
When working in GME-ACIS, treat it as a Git superproject whose modules and tests are separate submodules. Inspect submodule state before editing. Keep changes in the owning module and tests/gme, match observed ACIS behavior without calling the corresponding ACIS API from production code, run the narrow explicit GoogleTest filter before broader dependent-module tests, and commit submodule changes before updating the superproject gitlink.
```

#### Token 影响

插件挂载期间，该段落会为每次模型调用增加固定的请求头开销。

#### KV Cache 影响

该段落与配置无关，并在调用和会话之间保持字节稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- `gme_delivery_check` 会针对一个明确符号扫描总装仓与变更子模块的 diff；它是文本门禁，不能证明 ACIS 行为一致。
- 接口定位依赖 `rg`，并识别根 CMake 中的 `set(<MODULE>_DEPS ...)` 声明。
- Windows 构建固定使用 Visual Studio 2022 x64；非 Windows 配置使用默认 CMake generator。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

命令参数必须保持白名单校验，不要给这些领域工具增加自由命令字段。

</details>
