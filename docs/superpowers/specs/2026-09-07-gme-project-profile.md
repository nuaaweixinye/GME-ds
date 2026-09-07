# GME Project Profile Design

## Goal

Make DeepSeek Harness recognize, inspect, build, test, and retrieve private
knowledge for the GME-ACIS superproject without embedding machine secrets or
GME source code in the Harness repository.

## Repository Model

GME-ACIS is a CMake C/C++ superproject. Its production modules, tests, ACIS
reference tree, demos, and data are Git submodules. The root `CMakeLists.txt`
defines module dependencies and selects either all modules or one or more
`DEVELOP_<MODULE>` source modules. Changes are committed in the owning
submodule before the superproject updates its gitlink.

## Architecture

`@deepseek-ai/dsh-tool-gme` owns project-sensitive model tools. It resolves a
GME root from an explicit argument, configured root, or the calling session's
working directory; validates that the root contains the GME-ACIS markers; and
uses the mounted shell service for Git, CMake, and GoogleTest execution.

`@deepseek-ai/dsh-gme` is a profile bundle applied after `dsh-base` and
`dsh-web-app`. It mounts the GME tool, adds the existing WeKnora search tool,
adds the external GME-Skills directory to filesystem skill discovery, and
supplies deployment defaults through environment variables. No API keys are
stored in the bundle.

## P0: Project Runtime

P0 exposes:

- `gme_project_status`: validates the superproject, reports Git branch and
  cleanliness, classifies recursive submodule state, and checks Git/CMake.
- `gme_build`: configures and builds either all modules or one development
  module with explicit configuration and target.
- `gme_test`: runs an explicit GoogleTest filter from an existing build.
- A GME system-prompt section defining module ownership, ACIS parity, narrow
  testing, and submodule delivery rules.
- A profile bundle that can be installed into a `gme` profile.

Command arguments are allowlisted before interpolation. The shell executor
receives the session cancellation signal and project workdir. Tools return
canonical structured output including command, exit code, stdout, and stderr.

## P1: Project Index

P1 exposes `gme_locate_api`. It accepts a C/C++ identifier, searches bounded
source roots with `rg`, parses matches into file/line/text records, infers the
owning module, parses direct dependencies from the root CMake file, computes
transitive dependencies and reverse dependants, and returns likely test files.

The workspace remains the source of truth for code. The index is computed from
the current checkout so it cannot become stale across submodule changes.

## P2: Knowledge And Delivery

P2 mounts `knowledge_search` with the GME WeKnora base URL and knowledge-base
IDs supplied through `GME_WEKNORA_BASE_URL` and `GME_WEKNORA_KB_IDS`, falling
back to the currently deployed GME endpoint and knowledge-base ID. The API key
is resolved only through `WEKNORA_API_KEY`.

P2 also exposes `gme_delivery_check`. It reports modified submodules and scans
the current diff for direct calls from changed production lines to an
explicitly supplied forbidden ACIS symbol. It does not claim semantic parity;
it provides a deterministic pre-delivery gate alongside the existing GME
skills for behavior probes, RED/GREEN tests, memory checks, performance tests,
and pull-request submission.

## Configuration

The bundle reads:

- `GME_PROJECT_ROOT`: optional fixed GME-ACIS root.
- `GME_SKILLS_DIR`: defaults to `D:/workspace/GME-Skills/.dsh/skills`.
- `GME_WEKNORA_BASE_URL`: defaults to `http://172.16.220.222`.
- `GME_WEKNORA_KB_IDS`: comma-separated IDs, defaulting to the existing GME
  knowledge base.
- `WEKNORA_API_KEY`: required only when `knowledge_search` is called.

## Versioning And Acceptance

P0, P1, and P2 are separate commits on `feature/gme-project-profile`, based on
the existing WeKnora and GME branding commits. Every model-facing behavior is
covered through the real tool registry with a fake shell executor. Bundle
composition is tested by loading its YAML and asserting the effective plugin
rows and environment-driven configuration.
