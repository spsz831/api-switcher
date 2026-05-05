import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SecretVaultStore } from '../../src/stores/secret-vault.store'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-secret-vault-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('secret vault store', () => {
  it('损坏的 vault 文件不会让同步解析直接抛出', async () => {
    const store = new SecretVaultStore()
    const vaultPath = path.join(runtimeDir, 'secrets.json')
    await fs.writeFile(vaultPath, '{ invalid json', 'utf8')

    expect(store.getSync('claude/test')).toBeUndefined()
  })
})
