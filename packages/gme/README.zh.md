---
description: "GME 包组：用于开发 GME-ACIS 总装仓的项目感知工具和私有 profile 层。"
kind: "package-group"
---

# gme/ — GME-ACIS 项目适配

[English](README.md) | 中文

## 概述

`gme/` 包组让 DeepSeek Harness 适配 GME-ACIS 总装仓。工具包用于项目检查、受控构建与测试、API 定位和交付检查；profile bundle 用于把这些工具与 GME skills、WeKnora 检索组合起来。本包组不负责 GME 几何实现或 WeKnora 存储。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

各包分别负责项目工具、机器本地 profile 组合与 GME Test Agent 工作流。

| 包 | 职责 |
|---|---|
| [`tool-gme/`](tool-gme/README.zh.md) | 提供 GME 项目状态、构建、测试、API 定位和交付工具 |
| [`profile/`](profile/README.zh.md) | 将 GME 工具、外部 skills 和 WeKnora 组合成私有 profile |
| [`workflow/`](workflow/README.zh.md) | 通过 Python 后端操作 GME Test Agent 任务，保留 Codex，并独立于 tool-gme |

<a id="related-documentation"></a>
## 相关文档

- [工具目录](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-gme) — 准确的模型可见 GME schema。
- [配置目录](../../docs/config-catalog.zh.md#deepseek-aidsh-tool-gme) — GME 工具配置字段。
- [GME profile 设计](../../docs/superpowers/specs/2026-09-07-gme-project-profile.zh.md) — 适配架构和优先级范围。

<a id="dev-note"></a>
## 开发备注

机器密钥和 GME 源码必须保留在本包组之外。
