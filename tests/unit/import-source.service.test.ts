import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImportSourceError, ImportSourceService } from '../../src/services/import-source.service'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-import-source-'))
})

afterEach(async () => {
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('import source service', () => {
  it('文件不存在时返回 IMPORT_SOURCE_NOT_FOUND', async () => {
    const service = new ImportSourceService()
    const missingPath = path.join(runtimeDir, 'missing.json')

    await expect(service.load(missingPath)).rejects.toMatchObject({
      name: 'ImportSourceError',
      code: 'IMPORT_SOURCE_NOT_FOUND',
      message: `未找到导入文件：${missingPath}`,
    } satisfies Partial<ImportSourceError>)
  })

  it('JSON 非法时返回 IMPORT_SOURCE_INVALID', async () => {
    const filePath = path.join(runtimeDir, 'invalid.json')
    await fs.writeFile(filePath, '{invalid', 'utf8')

    await expect(new ImportSourceService().load(filePath)).rejects.toMatchObject({
      name: 'ImportSourceError',
      code: 'IMPORT_SOURCE_INVALID',
      message: `导入文件不是有效的 JSON：${filePath}`,
    } satisfies Partial<ImportSourceError>)
  })

  it('标准 export --json envelope 会被归一化为导入源数据', async () => {
    const filePath = path.join(runtimeDir, 'export.json')
    await fs.writeFile(filePath, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-prod',
              name: 'gemini-prod',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
            ],
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    const result = await new ImportSourceService().load(filePath)

    expect(result).toEqual({
      sourceFile: filePath,
      schemaVersion: '2026-04-15.public-json.v1',
      sourceCompatibility: {
        mode: 'strict',
        schemaVersion: '2026-04-15.public-json.v1',
        warnings: [],
      },
      profiles: [
        expect.objectContaining({
          profile: expect.objectContaining({
            id: 'gemini-prod',
            platform: 'gemini',
          }),
          exportedObservation: {
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
            ],
          },
          redactedInlineSecretFields: [],
        }),
      ],
    })
  })

  it('识别 redacted inline secret 占位并保留字段位置', async () => {
    const filePath = path.join(runtimeDir, 'redacted-export.json')
    await fs.writeFile(filePath, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'codex-prod',
              name: 'codex-prod',
              platform: 'codex',
              source: { apiKey: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/openai/v1' },
              apply: { OPENAI_API_KEY: '<redacted:inline-secret>', base_url: 'https://gateway.example.com/openai/v1' },
            },
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    const result = await new ImportSourceService().load(filePath)

    expect(result.sourceCompatibility).toEqual({
      mode: 'strict',
      schemaVersion: '2026-04-15.public-json.v1',
      warnings: ['导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。'],
    })
    expect(result.profiles[0]).toEqual({
      profile: {
        id: 'codex-prod',
        name: 'codex-prod',
        platform: 'codex',
        source: { apiKey: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/openai/v1' },
        apply: { OPENAI_API_KEY: '<redacted:inline-secret>', base_url: 'https://gateway.example.com/openai/v1' },
      },
      exportedObservation: undefined,
      redactedInlineSecretFields: ['source.apiKey', 'apply.OPENAI_API_KEY'],
    })
  })

  it('缺少 schemaVersion 的旧导出文件按兼容模式加载', async () => {
    const filePath = path.join(runtimeDir, 'legacy-export.json')
    await fs.writeFile(filePath, JSON.stringify({
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'claude-prod',
              name: 'claude-prod',
              platform: 'claude',
              source: { token: 'sk-live-123456' },
              apply: { ANTHROPIC_AUTH_TOKEN: 'sk-live-123456' },
            },
          },
        ],
      },
    }, null, 2), 'utf8')

    const result = await new ImportSourceService().load(filePath)

    expect(result.sourceCompatibility).toEqual({
      mode: 'schema-version-missing',
      schemaVersion: undefined,
      warnings: ['导入文件未声明 schemaVersion，当前按兼容模式解析。'],
    })
    expect(result.profiles).toHaveLength(1)
  })
})
