# GME 项目 Profile 实施计划

[English](2026-09-07-gme-project-profile.md) | 中文

> **面向 agent worker：** 必须使用子 skill：推荐用 superpowers:subagent-driven-development，或用 superpowers:executing-plans，逐项实施本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标：** 构建版本化 GME profile，使 DeepSeek Harness 具备 GME-ACIS 项目检查、受控构建与测试、实时 API 定位、WeKnora 检索和交付门禁。

**架构：** 一个聚焦 Host 的工具包通过现有 Harness 服务执行 GME 感知的检查与命令。另一个 bundle 将该工具与 WeKnora、文件系统 skills 组合，让部署值保留在 profile 配置和环境变量中。

**技术栈：** TypeScript、Cordis、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-shell`、Vitest、YAML profile patches、pnpm workspaces。

**规格：** `docs/superpowers/specs/2026-09-07-gme-project-profile.zh.md`

## 全局约束

- 在现有隔离 worktree 的 `feature/gme-project-profile` 上工作。
- 不得把 `WEKNORA_API_KEY` 写入跟踪文件或工具结果。
- GME 根目录只能来自显式配置、显式调用参数或调用会话 cwd。
- 只有在校验标识符、构建目录、配置、目标和 GoogleTest filter 后才能执行命令。
- 返回结构化规范值；渲染内容仅作为面向模型的文本。
- 分别提交 P0、P1 和 P2。

---

### 任务 1：P0 GME 运行时工具

**文件：**
- 新建：`packages/gme/tool-gme/package.json`
- 新建：`packages/gme/tool-gme/tsconfig.json`
- 新建：`packages/gme/tool-gme/src/index.ts`
- 新建：`packages/gme/tool-gme/src/project.ts`
- 新建：`packages/gme/tool-gme/src/commands.ts`
- 新建：`packages/gme/tool-gme/tests/tool-gme.spec.ts`
- 修改：`pnpm-lock.yaml`

**接口：**
- 提供：`resolveGmeRoot(input, configured, sessionCwd): Promise<string>`。
- 提供：`inspectGmeProject(root, run): Promise<GmeProjectStatus>`。
- 提供：`buildGmeCommand(args, platform): string` 与 `buildGtestCommand(args, platform): string`。
- 提供工具：`gme_project_status`、`gme_build` 和 `gme_test`。

- [ ] **步骤 1：编写失败的状态测试**

在临时目录创建包含 `CMakeLists.txt`、`.gitmodules` 和脚本化 shell 响应的 fixture。断言已初始化且指针对齐、以空格开头的子模块，与缺失 `-`、偏离 `+`、冲突 `U` 状态分别计数；并断言缺少两个标志文件的目录通过 `ctx.tools.execute()` 返回错误。

- [ ] **步骤 2：运行状态测试并确认 RED**

运行 `pnpm exec vitest run packages/gme/tool-gme/tests/tool-gme.spec.ts`。预期：失败，因为 `@deepseek-ai/dsh-tool-gme` 及其工具尚不存在。

- [ ] **步骤 3：实现根目录解析和项目检查**

使用 `node:fs/promises` 检查标志文件，并用 `ctx.shell.run(ctx.shell.resolve(...))` 执行 `git status --porcelain=v1 --branch`、`git submodule status --recursive`、`git --version` 和 `cmake --version`。将字面命令输出解析为规范状态对象，并保留非零诊断信息。

- [ ] **步骤 4：运行状态测试并确认 GREEN**

运行同一个 Vitest 命令。预期：全部状态用例通过。

- [ ] **步骤 5：编写失败的构建与测试命令测试**

断言全模块 Debug、单模块 Release、仅构建复用、Windows `tests.exe`、POSIX `tests` 的字面命令，并断言 module/filter/build-directory 注入在 fake shell 收到请求前被拒绝。

- [ ] **步骤 6：运行命令测试并确认 RED**

运行包测试。预期：失败，因为命令生成器和执行工具尚不存在。

- [ ] **步骤 7：实现 `gme_build` 与 `gme_test`**

校验所有类似枚举与标识符的参数，为受控路径加引号，通过 shell 服务使用工具取消信号执行，并返回结构化命令结果。加入固定的 GME 开发系统提示词段落。

- [ ] **步骤 8：验证并提交 P0**

运行包测试和 `pnpm exec tsc -p packages/gme/tool-gme/tsconfig.json --noEmit`。提交信息为 `Add GME project runtime tools`。

### 任务 2：P1 实时 API 定位器

**文件：**
- 新建：`packages/gme/tool-gme/src/indexer.ts`
- 修改：`packages/gme/tool-gme/src/index.ts`
- 修改：`packages/gme/tool-gme/tests/tool-gme.spec.ts`

**接口：**
- 提供：`parseModuleDependencies(cmakeText): ModuleGraph`。
- 提供：`locateGmeApi(root, symbol, run): Promise<GmeApiLocation>`。
- 提供工具：`gme_locate_api`。

- [ ] **步骤 1：编写失败的依赖图测试**

使用包含 `BASE_DEPS`、`KERNEL_DEPS`、`CONSTRUCTORS_DEPS` 和 `QUERY_DEPS` 的字面 CMake fixture。用人工推导数组断言直接依赖、传递依赖和反向依赖方。

- [ ] **步骤 2：运行测试并确认 RED**

运行包测试。预期：失败，因为图解析器尚不存在。

- [ ] **步骤 3：实现 CMake 依赖解析器**

只解析 `set(<MODULE>_DEPS ...)` 声明，规范化带引号模块 token，在遍历中拒绝循环，并返回排序稳定的结果。

- [ ] **步骤 4：编写失败的 API 定位测试**

编写包含声明、实现和测试匹配的 `rg --fixed-strings --line-number` 响应。断言推断模块、分类匹配、测试路径、直接依赖和反向依赖方。断言无效 C++ 标识符在搜索执行前被拒绝。

- [ ] **步骤 5：运行测试并确认 RED**

运行包测试。预期：失败，因为 `gme_locate_api` 尚不存在。

- [ ] **步骤 6：实现并验证 `gme_locate_api`**

在 `include`、`module`、`tests` 和 `demo` 上运行有界搜索；解析 Windows 与 POSIX 路径记录；限制返回匹配数；渲染简洁代码地图。运行包测试和 TypeScript 检查直至通过。

- [ ] **步骤 7：提交 P1**

提交信息为 `Add live GME API locator`。

### 任务 3：P2 知识与交付 Bundle

**文件：**
- 新建：`packages/gme/profile/package.json`
- 新建：`packages/gme/profile/tsconfig.json`
- 新建：`packages/gme/profile/src/index.ts`
- 新建：`packages/gme/profile/cordis.patch.yml`
- 新建：`packages/gme/profile/tests/profile.spec.ts`
- 新建：`packages/gme/tool-gme/src/delivery.ts`
- 修改：`packages/gme/tool-gme/src/index.ts`
- 修改：`packages/gme/tool-gme/tests/tool-gme.spec.ts`
- 修改：`pnpm-lock.yaml`

**接口：**
- 提供工具：`gme_delivery_check`。
- 提供 bundle：`@deepseek-ai/dsh-gme-profile`。
- 使用：`@deepseek-ai/dsh-tool-gme`、`@deepseek-ai/dsh-tool-weknora` 和现有 `skill-filesystem` 行。

- [ ] **步骤 1：编写失败的交付门禁测试**

编写变更子模块状态和包含新增生产代码调用的 unified diff。断言提供的禁用 ACIS 符号只在新增生产行中报告，并排除测试行与删除行。

- [ ] **步骤 2：运行测试并确认 RED**

运行工具包测试。预期：失败，因为交付解析器和工具尚不存在。

- [ ] **步骤 3：实现并验证 `gme_delivery_check`**

校验符号，运行有界 Git 命令，解析变更 gitlink 和工作区，扫描每个变更子模块相对其记录提交的 diff，返回确定性结果，然后运行包测试和类型检查。

- [ ] **步骤 4：编写失败的 bundle composition 测试**

使用仓库 YAML loader 加载 `cordis.patch.yml`。断言它插入 GME 工具与 WeKnora，以完整既有字段和 `GME_SKILLS_DIR` 替换 `skill-filesystem`，并映射逗号分隔的知识库 ID。

- [ ] **步骤 5：运行 bundle 测试并确认 RED**

运行 `pnpm exec vitest run packages/gme/profile/tests/profile.spec.ts`。预期：失败，因为 bundle 尚不存在。

- [ ] **步骤 6：实现 bundle 和 profile 文档**

创建包含环境变量值的 bundle manifest 与 patch。在包 README 中记录准确的 `dsh plugin --profile gme add` 安装命令、环境变量、Windows 启动命令、工具和预期 GME 工作流。

- [ ] **步骤 7：验证并提交 P2**

运行两个包的测试、两个包的 TypeScript 检查、受新包影响的生成目录检查，以及一次源码构建。提交信息为 `Add GME profile bundle and delivery gate`。

### 任务 4：安装并冒烟测试本地 GME Profile

**文件：**
- 在 Git 外创建：通过 DSH profile CLI 创建 `C:/Users/xk/.dsh/profiles/gme/*`。

**接口：**
- 使用：已构建的本地包和 `GME_PROJECT_ROOT=D:/workspace/GME-ACIS`。
- 提供：可直接启动的 `dsh --profile gme web` 安装。

- [ ] **步骤 1：构建源码发行物**

运行 `pnpm run build`，确认包产物包含两个 GME 包及其 patch 文件。

- [ ] **步骤 2：创建并配置本地 profile**

使用受支持的 `dsh plugin --profile gme add` 流程创建 profile，加入 base、web-app 和 GME bundles，然后设置机器本地环境值，且不把 `WEKNORA_API_KEY` 写入仓库。

- [ ] **步骤 3：运行配置与浏览器冒烟检查**

导出组合后的 profile，确认四个 GME 工具和 `knowledge_search` 已挂载。在未使用的本地端口启动 Web profile，请求其认证 URL，然后只停止本任务启动的进程。

- [ ] **步骤 4：记录最终验证**

运行 `git status --short`，列出三个提交，并报告 profile 启动命令和仍不可用的外部前置条件。
