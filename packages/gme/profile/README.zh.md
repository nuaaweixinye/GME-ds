---
description: "挂载 GME 项目工具、GME skills 和 WeKnora 检索的私有 GME-ACIS profile 层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-gme-profile

[English](README.md) | 中文

## 概述

`dsh-gme-profile` 把基于 base 的 DeepSeek Harness profile 转换为 GME-ACIS 开发 profile。它挂载 GME 项目工具、追加外部 GME-Skills 目录，并配置已有的 WeKnora `knowledge_search` 工具，但不会保存 API key。

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

在当前源码 checkout 中，将这个私有 bundle 链接到已有 Web profile：

```powershell
pnpm dsh plugin --profile web link ./packages/gme/profile
$env:GME_PROJECT_ROOT = 'D:/workspace/GME-ACIS'
$env:GME_SKILLS_DIR = 'D:/workspace/GME-Skills/.dsh/skills'
$env:WEKNORA_API_KEY = '<managed-secret>'
pnpm dsh web
```

上面展示的项目与 skill 环境变量是可选项，因为这个私有 profile 已经默认使用对应的本地路径。可以用逗号分隔的 `GME_WEKNORA_KB_IDS` 覆盖部署知识库。`WEKNORA_API_KEY` 只能放在进程环境或 Harness credentials 中，不能写进 patch。

-----

<a id="understand-the-implementation"></a>
## 理解实现

[`cordis.patch.yml`](cordis.patch.yml) 覆盖 base 的 `skill-filesystem` 配置，并插入 `@deepseek-ai/dsh-tool-gme` 与 `@deepseek-ai/dsh-tool-weknora`。[`src/index.ts`](src/index.ts) 是空模块入口，因为 profile composition 才是本包的运行时行为。

本包不发布单独的运行时不变量配套文档，因为它只承载静态 profile patch。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [GME 包地图](../README.zh.md) — 本项目适配负责的包。
- [GME 工具包](../tool-gme/README.zh.md) — 项目感知工具行为与 schema。
- [WeKnora 工具](../../web/tool-weknora/README.zh.md) — 检索配置与结果契约。

-----

<a id="model-experience"></a>
## 模型体验

### 组合后的 GME 上下文

#### 模型看到的内容

组合后的 profile 会公开 `gme_project_status`、`gme_build`、`gme_test`、`gme_locate_api`、`gme_delivery_check` 和 `knowledge_search`，以及配置后的 GME skill 目录与项目提示词。

#### Token 影响

工具 schema、固定项目提示词和发现到的 skill 元数据会增加请求头开销；搜索结果和命令输出只在调用时追加。

#### KV Cache 影响

包配置与外部 skill 目录不变时，前缀保持稳定；修改 skill 元数据或 profile 值会使受影响的前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 这是从源码 checkout 链接的私有 bundle，不属于正式发布 profile。
- 默认 skill 路径面向 Windows；其他机器必须设置 `GME_SKILLS_DIR`。
- WeKnora 可用性与知识新鲜度仍由部署负责。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

本 bundle 假定 base profile 已经提供 `skill-filesystem` 配置行和工具所需服务。

</details>
