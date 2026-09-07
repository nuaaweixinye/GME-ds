---
description: "Private GME-ACIS profile layer that mounts project tools, GME skills, and WeKnora retrieval."
kind: "package-bundle"
---

# @deepseek-ai/dsh-gme-profile

English | [中文](README.zh.md)

## Summary

`dsh-gme-profile` turns a base-backed DeepSeek Harness profile into a GME-ACIS development profile. It mounts the GME project tools, adds the external GME-Skills root, and configures the existing WeKnora `knowledge_search` tool without storing its API key.

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

From this source checkout, link this private bundle into the existing Web profile:

```powershell
pnpm dsh plugin --profile web link ./packages/gme/profile
$env:GME_PROJECT_ROOT = 'D:/workspace/GME-ACIS'
$env:GME_SKILLS_DIR = 'D:/workspace/GME-Skills/.dsh/skills'
$env:WEKNORA_API_KEY = '<managed-secret>'
pnpm dsh web
```

The project and skill variables shown above are optional because this private profile already defaults to those local paths. Comma-separated `GME_WEKNORA_KB_IDS` overrides the deployed knowledge bases. Keep `WEKNORA_API_KEY` in the process environment or Harness credentials, never in the patch.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

[`cordis.patch.yml`](cordis.patch.yml) replaces the base `skill-filesystem` configuration and inserts `@deepseek-ai/dsh-tool-gme` plus `@deepseek-ai/dsh-tool-weknora`. [`src/index.ts`](src/index.ts) is an empty module entry because profile composition is the package's runtime behavior.

No runtime invariant companion is published; this package carries only a static profile patch.

-----

<a id="further-exploration"></a>
## Further Exploration

- [GME package map](../README.md) — packages owned by this project adaptation.
- [GME tool package](../tool-gme/README.md) — project-aware tool behavior and schemas.
- [WeKnora tool](../../web/tool-weknora/README.md) — retrieval configuration and result contract.

-----

<a id="model-experience"></a>
## Model Experience

### Composed GME context

#### What the model sees

The composed profile exposes `gme_project_status`, `gme_build`, `gme_test`, `gme_locate_api`, `gme_delivery_check`, and `knowledge_search`, plus the configured GME skill catalog and project prompt.

#### Token effect

Tool schemas, the fixed project prompt, and discovered skill metadata add a request-header cost; search results and command outputs append only when invoked.

#### KV Cache effect

The prefix remains stable while package configuration and the external skill catalog are unchanged; edits to skill metadata or profile values invalidate the affected prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This private bundle is linked from the source checkout and is not part of the official release profile set.
- The default skills path is Windows-specific; set `GME_SKILLS_DIR` on other machines.
- WeKnora availability and knowledge freshness remain deployment responsibilities.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The bundle assumes the base profile already owns the `skill-filesystem` row and required tool services.

</details>
