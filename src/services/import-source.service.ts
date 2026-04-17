import fs from 'node:fs/promises'
import path from 'node:path'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import type { ImportObservation, ImportSourceCompatibility } from '../types/command'
import type { Profile } from '../types/profile'

interface ImportEnvelope {
  schemaVersion?: string
  ok?: boolean
  action?: string
  data?: {
    profiles?: unknown
  }
}

export interface ImportedProfileSource {
  profile: Profile
  exportedObservation?: ImportObservation
}

export interface LoadedImportSource {
  sourceFile: string
  schemaVersion?: string
  sourceCompatibility: ImportSourceCompatibility
  profiles: ImportedProfileSource[]
}

export class ImportSourceError extends Error {
  constructor(
    public readonly code:
      | 'IMPORT_SOURCE_NOT_FOUND'
      | 'IMPORT_SOURCE_INVALID'
      | 'IMPORT_UNSUPPORTED_SCHEMA',
    message: string,
  ) {
    super(message)
    this.name = 'ImportSourceError'
  }
}

export class ImportSourceService {
  async load(filePath: string): Promise<LoadedImportSource> {
    const resolvedPath = path.resolve(filePath)
    const sourceText = await this.readSourceFile(resolvedPath)
    const payload = this.parseSourceJson(sourceText, resolvedPath)
    const profiles = this.extractProfiles(payload, resolvedPath)

    return {
      sourceFile: resolvedPath,
      schemaVersion: payload.schemaVersion,
      sourceCompatibility: this.buildSourceCompatibility(payload),
      profiles,
    }
  }

  private async readSourceFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new ImportSourceError('IMPORT_SOURCE_NOT_FOUND', `未找到导入文件：${filePath}`)
      }

      throw error
    }
  }

  private parseSourceJson(sourceText: string, filePath: string): ImportEnvelope {
    try {
      return JSON.parse(sourceText) as ImportEnvelope
    } catch {
      throw new ImportSourceError('IMPORT_SOURCE_INVALID', `导入文件不是有效的 JSON：${filePath}`)
    }
  }

  private extractProfiles(payload: ImportEnvelope, filePath: string): ImportedProfileSource[] {
    if (payload.schemaVersion && payload.schemaVersion !== PUBLIC_JSON_SCHEMA_VERSION) {
      throw new ImportSourceError(
        'IMPORT_UNSUPPORTED_SCHEMA',
        `导入文件 schemaVersion 不受支持：${payload.schemaVersion}`,
      )
    }

    if (payload.ok !== true || payload.action !== 'export' || !Array.isArray(payload.data?.profiles)) {
      throw new ImportSourceError('IMPORT_SOURCE_INVALID', `导入文件不是有效的 export --json 输出：${filePath}`)
    }

    return payload.data.profiles
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const profile = item.profile
        if (!this.isProfile(profile)) {
          throw new ImportSourceError('IMPORT_SOURCE_INVALID', `导入文件包含无效 profile：${filePath}`)
        }

        return {
          profile,
          exportedObservation: this.pickObservation(item),
        }
      })
  }

  private buildSourceCompatibility(payload: ImportEnvelope): ImportSourceCompatibility {
    if (!payload.schemaVersion) {
      return {
        mode: 'schema-version-missing',
        schemaVersion: undefined,
        warnings: ['导入文件未声明 schemaVersion，当前按兼容模式解析。'],
      }
    }

    return {
      mode: 'strict',
      schemaVersion: payload.schemaVersion,
      warnings: [],
    }
  }

  private pickObservation(item: Record<string, unknown>): ImportObservation | undefined {
    const observation: ImportObservation = {
      scopeCapabilities: Array.isArray(item.scopeCapabilities) ? item.scopeCapabilities as ImportObservation['scopeCapabilities'] : undefined,
      scopeAvailability: Array.isArray(item.scopeAvailability) ? item.scopeAvailability as ImportObservation['scopeAvailability'] : undefined,
      defaultWriteScope: typeof item.defaultWriteScope === 'string' ? item.defaultWriteScope : undefined,
      observedAt: typeof item.observedAt === 'string' ? item.observedAt : undefined,
    }

    if (
      !observation.scopeCapabilities
      && !observation.scopeAvailability
      && !observation.defaultWriteScope
      && !observation.observedAt
    ) {
      return undefined
    }

    return observation
  }

  private isProfile(value: unknown): value is Profile {
    if (!value || typeof value !== 'object') {
      return false
    }

    const candidate = value as Record<string, unknown>
    return typeof candidate.id === 'string'
      && typeof candidate.name === 'string'
      && typeof candidate.platform === 'string'
      && !!candidate.source
      && typeof candidate.source === 'object'
      && !!candidate.apply
      && typeof candidate.apply === 'object'
  }
}
