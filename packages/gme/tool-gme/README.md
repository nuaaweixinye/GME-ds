---
description: "Model-facing GME-ACIS inspection, build, test, API location, and delivery tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-gme

English | [中文](README.zh.md)

## Summary

`dsh-tool-gme` gives Harness a live view of a GME-ACIS checkout. It validates the superproject before work, runs controlled CMake and GoogleTest commands, locates C++ APIs against the current files, derives module impact from CMake, and checks added production lines for a caller-supplied forbidden ACIS call.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it in a composition containing `tools`, `shell`, and `systemPrompt`. A confining shell must also expose `sandboxPolicy`; GME commands resolve the calling session's current mode and pass it to every shell request:

```yaml
- name: '@deepseek-ai/dsh-tool-gme'
  config:
    projectRoot: D:/workspace/GME-ACIS
    timeoutMs: 600000
```

Call `gme_project_status` first. Use `gme_locate_api` before editing, `gme_build` and `gme_test` for narrow verification, and `gme_delivery_check` before committing submodules.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Role |
|---|---|
| [`src/project.ts`](src/project.ts) | Root validation and project status parsing |
| [`src/commands.ts`](src/commands.ts) | Validated CMake and GoogleTest command construction |
| [`src/indexer.ts`](src/indexer.ts) | Live symbol search and CMake dependency graph |
| [`src/delivery.ts`](src/delivery.ts) | Unified-diff and submodule delivery checks |
| [`src/index.ts`](src/index.ts) | Tool registration, execution, schemas, and rendering |

All external commands use the mounted shell service, the GME root as workdir, and the caller cancellation signal.

No runtime invariant companion is published; the package owns no independent persistent event sequence.

-----

<a id="further-exploration"></a>
## Further Exploration

- [GME package map](../README.md) — the tool and profile ownership boundary.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-gme) — exact model-facing schemas.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-gme) — accepted plugin configuration.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

Five fixed schemas documented in the [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-gme): `gme_project_status`, `gme_build`, `gme_test`, `gme_locate_api`, and `gme_delivery_check`.

#### Token effect

The five schemas add a fixed request-header cost; structured results are appended only after calls, with API matches and shell output bounded by the implementation.

#### KV Cache effect

The schema prefix is stable while package configuration is unchanged, so calls reuse the same cached request prefix.

### GME system prompt

#### What the model sees

One fixed project-policy paragraph is added to the system prompt.

##### Project policy

```markdown
When working in GME-ACIS, treat it as a Git superproject whose modules and tests are separate submodules. Inspect submodule state before editing. Keep changes in the owning module and tests/gme, match observed ACIS behavior without calling the corresponding ACIS API from production code, run the narrow explicit GoogleTest filter before broader dependent-module tests, and commit submodule changes before updating the superproject gitlink.
```

#### Token effect

The paragraph adds a fixed request-header cost to every model call while this plugin is mounted.

#### KV Cache effect

The paragraph is configuration-independent and remains byte-stable across calls and sessions.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- `gme_delivery_check` scans root and changed-submodule diffs for one explicit symbol; it is a textual guard, not proof of ACIS behavioral parity.
- The API locator requires `rg` and recognizes root `set(<MODULE>_DEPS ...)` declarations.
- Windows builds assume Visual Studio 2022 x64; non-Windows configure uses the default CMake generator.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep command inputs allowlisted. Do not add a free-form command field to these domain tools.

</details>
