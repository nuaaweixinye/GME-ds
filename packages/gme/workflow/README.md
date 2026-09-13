---
description: "GME Test Agent workflows inside Harness, retaining the Python backend and Codex coding engine."
kind: "package-reference"
---

# @deepseek-ai/dsh-gme-workflow

English | [中文](README.zh.md)

## Summary

This opt-in plugin lets Harness inspect interfaces, create and continue test tasks, build, test, audit memory, repair recorded failures, and submit PRs through GME Test Agent. Codex remains the coding engine. The package does not depend on or mount `tool-gme`.

## Use this package

Use an existing GME Test Agent checkout with its Python dependencies, configured GME repository, compiler toolchain and Codex authentication. The plugin consumes `backend/run_backend.py`, `config.local.json`, and the existing task database; it does not copy the Python application or launch its Vue frontend.

Build and link the package from this Harness source checkout:

```powershell
pnpm exec tsc -b packages/gme/workflow
pnpm exec tsdown --filter '@deepseek-ai/dsh-gme-workflow'
$env:GME_TEST_AGENT_ROOT = 'D:/workspace/gme-test-agent'
$env:GME_TEST_AGENT_PYTHON = 'C:/ProgramData/Miniconda3/envs/agent/python.exe'
pnpm dsh plugin --profile web link ./packages/gme/workflow
pnpm dsh web
```

The environment values must be present when starting Harness. For persistent machine configuration, override the `gme-workflow` row in the profile patch with the following complete config:

```yaml
- id: gme-workflow
  config:
    backendRoot: D:/workspace/gme-test-agent
    pythonPath: C:/ProgramData/Miniconda3/envs/agent/python.exe
    port: 8765
    autoStart: true
```

Mount on a base-backed profile with `tools` and `systemPrompt`. Automatic startup additionally requires a local `subprocess` provider. If an older profile separately enables `tool-gme`, disable that existing row in that profile; installing this bundle does not remove other packages.

### Operations

| Tool | Operations |
|---|---|
| `gme_workflow_query` | Health, environment, interface catalogs, tasks, incremental events, test results, artifacts, failures and observations |
| `gme_workflow_create` | Single test task, interface batch, or repair of selected failures |
| `gme_workflow_action` | Extend, retry, build, test, memory audit, remove selected tests, clean worktree, delete task |
| `gme_workflow_submit` | Task PR, known-failure skip PR, or selected-tests PR |

For tests and extension, pass either catalog `interface_ids` or a free-form `goal`, never both. The backend replaces free-form goals when IDs are supplied; the plugin rejects that combination. Batches require IDs. Query interfaces before selecting IDs, and use backend job IDs rather than Harness session IDs.

Creation and actions can return `accepted: true`; this means queued work, not successful validation. Query the task and its test results. Report pages expose `content` (a slice of serialized JSON), `total_characters` and `next_offset`; repeat the same query with that offset. Growing lists may shift between pages; use bounded incremental `events.after` queries for live progress and completed artifacts for stable reports. Infrastructure failures appear as tool errors. A returned job with `status: failed` is a valid query result.

### Worker lifetime and credentials

The first request reuses a server only after an authenticated health response. Otherwise, `autoStart: true` starts the configured Python entrypoint. Concurrent calls share startup. Authentication failure or an occupied non-GME port fails without starting another worker. The token is read from `tokenFile` (default `logs/web-api-token.log`); automatic startup creates a missing token file. Credentials never appear in tool arguments. Only the API token is explicitly forwarded to the managed child; Codex normally uses its existing local sign-in.

Disposal terminates only a backend started by this plugin, including its child processes. Closing or reloading Harness can therefore interrupt owned jobs. An independently started backend survives. An owned worker that exits is restarted by a subsequent request; the interrupted job is not automatically retried. Aborting a tool stops waiting but does not cancel an accepted backend job. POST requests are never retried automatically: inspect tasks after an uncertain submission.

## Model Experience

### Guidance and schemas

#### What the model sees

See the canonical [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-gme-workflow). Four workflow schemas and one project guidance section join the request prefix. The guidance distinguishes acceptance from validation, treats reports as data, and requires user intent for PRs, skips and cleanup. Deployment paths and credentials stay out of the schemas.

#### Token effect

Schemas and guidance have a fixed per-request cost. Report text is bounded by `pageChars` (12,000 by default, up to 50,000); the small result envelope is additional. HTTP responses are bounded by `maxResponseBytes` (8 MiB by default).

#### KV Cache effect

The prefix is stable while schemas and guidance are unchanged. Tool results append to the conversation and its durable session log.

### Presentation

#### What the model sees

Existing generic Harness tool cards display the action and serialized result. A dedicated task dashboard is not included.

#### Token effect

Presentation adds no model text beyond the result envelope.

#### KV Cache effect

Presentation does not alter the model request prefix.

## Known Limitations and Deferred Work

- The existing Python checkout and configured local GME toolchain remain required.
- Backend jobs have no cancellation endpoint or automatic process-restart recovery.
- PR submission and cleanup follow existing backend rules and the user's instruction; the plugin does not add another approval dialog.
- Free-form tasks inherit the backend's free-form selection and validation behavior.
- Large report pages are character windows, not an immutable snapshot or structured table.

### Dev Note

`src/backend.ts` owns authenticated transport and worker lifetime. `src/index.ts` owns tool schemas, route mapping and presentation. No invariant companion is published: backend state is authoritative and the plugin maintains no duplicate durable task state. Lifecycle and Loader tests cover the locally owned worker and registration. See the [decision](../../../.agents/notes/implemented/feature/2026-09-12-gme-workflow-plugin.md).
