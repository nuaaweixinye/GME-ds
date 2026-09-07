# GME Project Profile Implementation Plan

English | [中文](2026-09-07-gme-project-profile.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned GME profile that gives DeepSeek Harness project checks, controlled build/test commands, live API location, WeKnora retrieval, and a delivery gate for GME-ACIS.

**Architecture:** A focused Host tool package performs GME-aware inspection and execution through existing Harness services. A separate bundle composes that tool with WeKnora and filesystem skills so deployment values stay in profile configuration and environment variables.

**Tech Stack:** TypeScript, Cordis, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-shell`, Vitest, YAML profile patches, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-07-gme-project-profile.md`

## Global Constraints

- Work on `feature/gme-project-profile` in the existing isolated worktree.
- Keep `WEKNORA_API_KEY` out of tracked files and tool results.
- Resolve GME roots only from explicit config, explicit call input, or the calling session cwd.
- Execute commands only after validating identifiers, build directories, configurations, targets, and GoogleTest filters.
- Return structured canonical values; rendering is model-facing prose only.
- Commit P0, P1, and P2 separately.

---

### Task 1: P0 GME Runtime Tool

**Files:**
- Create: `packages/gme/tool-gme/package.json`
- Create: `packages/gme/tool-gme/tsconfig.json`
- Create: `packages/gme/tool-gme/src/index.ts`
- Create: `packages/gme/tool-gme/src/project.ts`
- Create: `packages/gme/tool-gme/src/commands.ts`
- Create: `packages/gme/tool-gme/tests/tool-gme.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `resolveGmeRoot(input, configured, sessionCwd): Promise<string>`.
- Produces: `inspectGmeProject(root, run): Promise<GmeProjectStatus>`.
- Produces: `buildGmeCommand(args, platform): string` and `buildGtestCommand(args, platform): string`.
- Produces tools: `gme_project_status`, `gme_build`, and `gme_test`.

- [ ] **Step 1: Write failing status tests**

Create fixtures in a temporary directory with `CMakeLists.txt`, `.gitmodules`, and scripted shell responses. Assert that an initialized, pointer-aligned space-prefixed submodule is counted separately from missing `-`, divergent `+`, and conflicted `U` states, and that a directory without both markers returns an error through `ctx.tools.execute()`.

- [ ] **Step 2: Run status tests and verify RED**

Run `pnpm exec vitest run packages/gme/tool-gme/tests/tool-gme.spec.ts`. Expected: FAIL because `@deepseek-ai/dsh-tool-gme` and its tools do not exist.

- [ ] **Step 3: Implement root resolution and project inspection**

Use `node:fs/promises` for markers and `ctx.shell.run(ctx.shell.resolve(...))` for `git status --porcelain=v1 --branch`, `git submodule status --recursive`, `git --version`, and `cmake --version`. Parse the literal command outputs into the canonical status object and preserve non-zero diagnostics.

- [ ] **Step 4: Run status tests and verify GREEN**

Run the same Vitest command. Expected: all status cases PASS.

- [ ] **Step 5: Write failing build and test command tests**

Assert literal commands for all-module Debug configuration, one-module Release configuration, build-only reuse, Windows `tests.exe`, POSIX `tests`, and reject module/filter/build-directory injection before the fake shell sees a request.

- [ ] **Step 6: Run command tests and verify RED**

Run the package test. Expected: FAIL because command builders and execution tools are absent.

- [ ] **Step 7: Implement `gme_build` and `gme_test`**

Validate all enum-like and identifier arguments, quote controlled paths, run through the shell service with the tool cancellation signal, and return a structured command result. Add the fixed GME development system-prompt section.

- [ ] **Step 8: Verify and commit P0**

Run the package test and `pnpm exec tsc -p packages/gme/tool-gme/tsconfig.json --noEmit`. Commit as `Add GME project runtime tools`.

### Task 2: P1 Live API Locator

**Files:**
- Create: `packages/gme/tool-gme/src/indexer.ts`
- Modify: `packages/gme/tool-gme/src/index.ts`
- Modify: `packages/gme/tool-gme/tests/tool-gme.spec.ts`

**Interfaces:**
- Produces: `parseModuleDependencies(cmakeText): ModuleGraph`.
- Produces: `locateGmeApi(root, symbol, run): Promise<GmeApiLocation>`.
- Produces tool: `gme_locate_api`.

- [ ] **Step 1: Write failing dependency graph tests**

Use a literal CMake fixture containing `BASE_DEPS`, `KERNEL_DEPS`, `CONSTRUCTORS_DEPS`, and `QUERY_DEPS`. Assert direct dependencies, transitive dependencies, and reverse dependants with hand-derived arrays.

- [ ] **Step 2: Run tests and verify RED**

Run the package test. Expected: FAIL because the graph parser is absent.

- [ ] **Step 3: Implement the CMake dependency parser**

Parse only `set(<MODULE>_DEPS ...)` declarations, normalize quoted module tokens, reject cycles during traversal, and return sorted stable results.

- [ ] **Step 4: Write failing API-location tests**

Script an `rg --fixed-strings --line-number` response containing declaration, implementation, and test matches. Assert inferred module, classified matches, test paths, direct dependencies, and reverse dependants. Assert invalid C++ identifiers are rejected before search execution.

- [ ] **Step 5: Run tests and verify RED**

Run the package test. Expected: FAIL because `gme_locate_api` is absent.

- [ ] **Step 6: Implement and verify `gme_locate_api`**

Run a bounded search over `include`, `module`, `tests`, and `demo`; parse Windows and POSIX path records; cap returned matches; and render a concise code map. Run package tests and TypeScript checking until green.

- [ ] **Step 7: Commit P1**

Commit as `Add live GME API locator`.

### Task 3: P2 Knowledge And Delivery Bundle

**Files:**
- Create: `packages/gme/profile/package.json`
- Create: `packages/gme/profile/tsconfig.json`
- Create: `packages/gme/profile/src/index.ts`
- Create: `packages/gme/profile/cordis.patch.yml`
- Create: `packages/gme/profile/tests/profile.spec.ts`
- Create: `packages/gme/tool-gme/src/delivery.ts`
- Modify: `packages/gme/tool-gme/src/index.ts`
- Modify: `packages/gme/tool-gme/tests/tool-gme.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces tool: `gme_delivery_check`.
- Produces bundle: `@deepseek-ai/dsh-gme-profile`.
- Consumes: `@deepseek-ai/dsh-tool-gme`, `@deepseek-ai/dsh-tool-weknora`, and the existing `skill-filesystem` row.

- [ ] **Step 1: Write failing delivery-gate tests**

Script changed submodule status and a unified diff containing added production calls. Assert the supplied forbidden ACIS symbol is reported only on added production lines, while test lines and removed lines are excluded.

- [ ] **Step 2: Run tests and verify RED**

Run the tool package test. Expected: FAIL because the delivery parser and tool are absent.

- [ ] **Step 3: Implement and verify `gme_delivery_check`**

Validate the symbol, run bounded Git commands, parse changed gitlinks and worktrees, scan each changed submodule against its recorded commit, return deterministic findings, then run package tests and typecheck.

- [ ] **Step 4: Write failing bundle composition tests**

Load `cordis.patch.yml` with the repository's YAML loader. Assert it inserts the GME tool and WeKnora, replaces `skill-filesystem` with complete existing fields plus `GME_SKILLS_DIR`, and maps comma-separated knowledge-base IDs.

- [ ] **Step 5: Run bundle tests and verify RED**

Run `pnpm exec vitest run packages/gme/profile/tests/profile.spec.ts`. Expected: FAIL because the bundle is absent.

- [ ] **Step 6: Implement the bundle and profile documentation**

Create the bundle manifest and patch with environment-backed values. Document the exact `dsh plugin --profile gme add` installation commands, environment variables, Windows launch command, tools, and expected GME workflow in package README files.

- [ ] **Step 7: Verify and commit P2**

Run both package tests, both package TypeScript checks, generated catalog checks affected by the new packages, and a source build. Commit as `Add GME profile bundle and delivery gate`.

### Task 4: Install And Smoke-Test The Local GME Profile

**Files:**
- Create outside Git: `C:/Users/xk/.dsh/profiles/gme/*` through the DSH profile CLI.

**Interfaces:**
- Consumes: the built local packages and `GME_PROJECT_ROOT=D:/workspace/GME-ACIS`.
- Produces: a directly launchable `dsh --profile gme web` installation.

- [ ] **Step 1: Build the source distribution**

Run `pnpm run build` and confirm the package artifacts contain both GME packages and their patch file.

- [ ] **Step 2: Create and configure the local profile**

Use the supported `dsh plugin --profile gme add` flow to create the profile, add base, web-app, and GME bundles, then set machine-local environment values without writing `WEKNORA_API_KEY` into the repository.

- [ ] **Step 3: Run configuration and browser smoke checks**

Dump the composed profile and verify the four GME tools plus `knowledge_search` are mounted. Launch the Web profile on an unused local port, request its authenticated URL, then stop only the process started by this task.

- [ ] **Step 4: Record final verification**

Run `git status --short`, list the three commits, and report the profile launch command and any external prerequisite that remains unavailable.
