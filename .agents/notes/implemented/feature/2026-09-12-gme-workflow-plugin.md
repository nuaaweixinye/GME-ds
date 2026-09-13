# Agent Note: GME workflow plugin

Status: implemented

English | [中文](2026-09-12-gme-workflow-plugin.zh.md)

## Problem

Users need GME Test Agent functions inside Harness while preserving Codex generation and repair. The existing tool-gme package is explicitly excluded. Reimplementing Git submodule handling, failure classification, memory audit and PR selection would duplicate an existing Python workflow.

## Decision

An opt-in bundle registers four workflow tools over the authenticated loopback API. The backend owns tasks, worktrees and validation evidence; Harness owns dialogue and records tool results. An existing authenticated backend is reused. An optional owned Python child is started through the subprocess service and terminated on disposal. No model-supplied paths select the backend or task working directory.

Queries and mutation requests have separate completion meanings. Mutations return accepted jobs and never retry automatically. Reports use bounded text windows with stable task identifiers. Interface selection and free-form goals are mutually exclusive because the backend overrides the latter when both are supplied.

## Alternatives considered

Reusing tool-gme conflicts with the requested scope. Porting the Python orchestration into TypeScript would duplicate existing workflow behavior. Replacing Codex with Harness inside the backend is deferred so this version can validate the plugin boundary independently.

## Validation

The 19 focused tests, package typecheck and build, targeted lint, headless recorded-session replay, and built-package read-only health/catalog/job queries passed. The local Web profile resolves the linked bundle with persistent backend configuration. Real Codex generation, GME compilation and PR submission were not exercised. The repository-wide export JSDoc gate reports seven existing violations in the Windows ACL package, outside this change.

Focused tests exercise HTTP contracts, input validation, bounded response paging, cancellation, error propagation, managed Python startup, process disposal and crash recovery. A Loader composition verifies namespace exports and real tool execution. Read-only integration queries must not create GME jobs or PRs.

## Consequences

Python and Codex remain runtime dependencies. Closing an owning Harness process can interrupt active backend work; an externally managed backend outlives the plugin. Task cancellation, automatic job recovery and a custom dashboard are not provided. Replacing Codex with Harness is a separate change.
