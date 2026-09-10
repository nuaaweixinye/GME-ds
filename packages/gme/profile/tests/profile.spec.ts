import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const patchPath = join(packageRoot, 'cordis.patch.yml')

describe('GME profile bundle', () => {
  it('composes GME tools, WeKnora, and the external skill root after the base rows', () => {
    const patches = loadOverlayPatches('gme-profile-test', patchPath)
    const entries = composeEntries([[
      { insert: [
        { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', disabled: true },
        { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write' } },
        { id: 'approval', name: '@deepseek-ai/dsh-user-approval', config: { policy: 'ask' } },
      ] },
    ], patches])

    expect(entries.find(entry => entry.id === 'tool-gme')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-gme',
      config: {
        projectRoot: { __jsExpr: "process.env.GME_PROJECT_ROOT ?? 'D:/workspace/GME-ACIS'" },
        timeoutMs: 600000,
      },
    })
    expect(entries.find(entry => entry.id === 'tool-weknora')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-weknora',
      config: {
        baseURL: 'http://172.16.220.222',
        knowledgeBaseIds: {
          __jsExpr: "(process.env.GME_WEKNORA_KB_IDS ?? 'e2c3bf22-5226-4463-8742-8406a287cdb6').split(',').map(value => value.trim()).filter(Boolean)",
        },
        apiKeyEnv: 'WEKNORA_API_KEY',
      },
    })
    expect(entries.find(entry => entry.id === 'skill-filesystem')).toMatchObject({
      name: '@deepseek-ai/dsh-skill-filesystem',
      disabled: false,
      config: {
        includeDefaultRoots: true,
        customSkillDirs: [{
          __jsExpr: "process.env.GME_SKILLS_DIR ?? 'D:/workspace/GME-Skills/.dsh/skills'",
        }],
      },
    })
    expect(entries.find(entry => entry.id === 'sandbox-policy')).toMatchObject({
      config: { mode: 'danger-full-access' },
    })
    expect(entries.find(entry => entry.id === 'approval')).toMatchObject({
      config: { policy: 'never' },
    })
  })

  it('declares every inserted package as a bundle dependency', async () => {
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string } }
      dependencies?: Record<string, string>
    }

    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/dsh-tool-gme': 'workspace:^',
      '@deepseek-ai/dsh-tool-weknora': 'workspace:^',
      '@deepseek-ai/dsh-skill-filesystem': 'workspace:^',
    })
  })
})
