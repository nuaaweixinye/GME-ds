# GME 项目 Profile 设计

[English](2026-09-07-gme-project-profile.md) | 中文

## 目标

让 DeepSeek Harness 能够识别、检查、构建、测试 GME-ACIS 总装仓，并检索其私有知识，同时不在 Harness 仓库中嵌入机器密钥或 GME 源码。

## 仓库模型

GME-ACIS 是一个 CMake C/C++ 总装仓。生产模块、测试、ACIS 参考树、演示和数据都以 Git 子模块组织。根 `CMakeLists.txt` 定义模块依赖，并选择全部模块或一个及以上 `DEVELOP_<MODULE>` 源码模块。修改先提交到所属子模块，再由总装仓更新 gitlink。

## 架构

`@deepseek-ai/dsh-tool-gme` 承载项目相关的模型工具。它从显式参数、配置根目录或调用会话工作目录解析 GME 根目录，校验其中存在 GME-ACIS 标志文件，并通过已挂载的 shell 服务执行 Git、CMake 和 GoogleTest。

`@deepseek-ai/dsh-gme-profile` 是应用于 `dsh-base` 与 `dsh-web-app` 之后的 profile bundle。它挂载 GME 工具和已有的 WeKnora 搜索工具，将外部 GME-Skills 目录加入文件系统 skill 发现，并通过环境变量提供部署默认值。bundle 不保存 API key。

## P0：项目运行时

P0 提供：

- `gme_project_status`：校验总装仓，报告 Git 分支与清洁状态，对递归子模块状态分类，并检查 Git/CMake。
- `gme_build`：使用明确的配置和目标，配置并构建全部模块或单个开发模块。
- `gme_test`：从已有构建运行明确的 GoogleTest filter。
- 一段 GME 系统提示词，规定模块所有权、ACIS 行为一致、窄范围测试和子模块交付规则。
- 一个可安装到 `gme` profile 的 bundle。

命令参数插值前必须通过白名单校验。shell executor 接收会话取消信号和项目 workdir。工具返回包含命令、退出码、stdout 与 stderr 的规范结构化输出。

## P1：项目索引

P1 提供 `gme_locate_api`。它接收 C/C++ 标识符，使用 `rg` 搜索有界源码根目录，将匹配解析为文件、行号和文本记录，推断所属模块，解析根 CMake 文件中的直接依赖，计算传递依赖与反向依赖方，并返回可能的测试文件。

工作区始终是代码事实来源。索引从当前 checkout 实时计算，因此不会因子模块变化而过期。

## P2：知识与交付

P2 挂载 `knowledge_search`，使用已部署的 GME WeKnora 基础 URL，知识库 ID 由 `GME_WEKNORA_KB_IDS` 提供，并回退到当前 GME 知识库 ID。API key 只通过 `WEKNORA_API_KEY` 解析。

P2 还提供 `gme_delivery_check`。它报告变更子模块，并扫描根 diff 及每个变更子模块相对总装仓记录提交的 diff，找出新增生产代码对显式指定禁用 ACIS 符号的直接调用。它不声称证明语义一致，而是与现有 GME skills 一起，为行为探测、RED/GREEN 测试、内存检查、性能测试和 PR 提交提供确定性交付门禁。

## 配置

bundle 读取：

- `GME_PROJECT_ROOT`：覆盖默认的 `D:/workspace/GME-ACIS` 根目录。
- `GME_SKILLS_DIR`：默认为 `D:/workspace/GME-Skills/.dsh/skills`。
- `GME_WEKNORA_KB_IDS`：逗号分隔的 ID，默认使用已有 GME 知识库。
- `WEKNORA_API_KEY`：仅在调用 `knowledge_search` 时需要。

## 版本管理与验收

P0、P1、P2 在 `feature/gme-project-profile` 上分别提交，并基于已有 WeKnora 与 GME 品牌提交。每个面向模型的行为都通过真实工具注册表和 fake shell executor 测试。bundle composition 通过加载 YAML 并断言有效插件行与环境变量驱动配置进行测试。
