import fs from 'node:fs'
import { atomicWrite } from '../utils/atomic-write'
import { readJsonFile } from '../utils/file-system'
import { getRuntimePaths } from '../utils/runtime-paths'

export interface SecretVaultFile {
  version: number
  secrets: Record<string, string>
}

const DEFAULT_SECRET_VAULT_FILE: SecretVaultFile = {
  version: 1,
  secrets: {},
}

export class SecretVaultStore {
  async read(): Promise<SecretVaultFile> {
    return readJsonFile<SecretVaultFile>(getRuntimePaths().secretsFile, DEFAULT_SECRET_VAULT_FILE)
  }

  async write(data: SecretVaultFile): Promise<void> {
    await atomicWrite(getRuntimePaths().secretsFile, JSON.stringify(data, null, 2))
  }

  async set(referenceKey: string, value: string): Promise<void> {
    const file = await this.read()
    file.secrets[referenceKey] = value
    await this.write(file)
  }

  async delete(referenceKey: string): Promise<void> {
    const file = await this.read()
    if (!(referenceKey in file.secrets)) {
      return
    }

    delete file.secrets[referenceKey]
    await this.write(file)
  }

  getSync(referenceKey: string): string | undefined {
    const filePath = getRuntimePaths().secretsFile
    if (!fs.existsSync(filePath)) {
      return undefined
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SecretVaultFile
      return parsed.secrets?.[referenceKey]
    } catch {
      return undefined
    }
  }
}
