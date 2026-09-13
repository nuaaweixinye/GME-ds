---
description: "The GME package group: project-aware tools and a private profile layer for developing the GME-ACIS superproject."
kind: "package-group"
---

# gme/ — GME-ACIS project adaptation

English | [中文](README.zh.md)

## Summary

The `gme/` group adapts DeepSeek Harness to the GME-ACIS superproject. Use its tool package for project inspection, controlled builds and tests, API location, and delivery checks. Use its profile bundle to compose those tools with GME skills and WeKnora retrieval. The group does not own GME geometry implementation or WeKnora storage.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The packages separate project tools, machine-local profile composition, and GME Test Agent workflows.

| Package | Role |
|---|---|
| [`tool-gme/`](tool-gme/README.md) | Exposes GME project status, build, test, API-location, and delivery tools |
| [`profile/`](profile/README.md) | Composes GME tools, external skills, and WeKnora into a private profile |
| [`workflow/`](workflow/README.md) | Operates GME Test Agent tasks through its Python backend, retaining Codex and independent of tool-gme |

<a id="related-documentation"></a>
## Related documentation

- [Tool catalog](../../docs/tool-catalog.md#deepseek-aidsh-tool-gme) — exact model-facing GME schemas.
- [Configuration catalog](../../docs/config-catalog.md#deepseek-aidsh-tool-gme) — GME tool configuration fields.
- [GME profile design](../../docs/superpowers/specs/2026-09-07-gme-project-profile.md) — adaptation architecture and priority scope.

<a id="dev-note"></a>
## Dev Note

Keep machine secrets and GME source code outside this package group.
