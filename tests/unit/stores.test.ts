import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { SnapshotStore } from '../../src/stores/snapshot.store'
import { StateStore } from '../../src/stores/state.store'
import { ProfileService } from '../../src/services/profile.service'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-store-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('stores', () => {
  it('profiles store 可写可读', async () => {
    const store = new ProfilesStore()
    await store.add({ id: 'claude-p1', name: 'p1', platform: 'claude', source: {}, apply: {} })
    const file = await store.read()
    expect(file.profiles).toHaveLength(1)
  })

  it('profile service 会拒绝重复 ID', async () => {
    const service = new ProfileService()
    await service.add({ id: 'claude-p1', name: 'p1', platform: 'claude', source: {}, apply: {} })

    await expect(service.add({ id: 'claude-p1', name: 'p1-duplicate', platform: 'claude', source: {}, apply: {} })).rejects.toThrow(
      '配置 ID 已存在：claude-p1',
    )
  })

  it('state store 可记录 current', async () => {
    const store = new StateStore()
    await store.markCurrent('claude', 'claude-p1', 'snapshot-claude-20260404000000-aaaaaa')
    const state = await store.read()
    expect(state.current.claude).toBe('claude-p1')
  })

  it('snapshot store 可写 manifest', async () => {
    const store = new SnapshotStore()
    await store.writeManifest('claude', 'snapshot-claude-20260404000000-aaaaaa', {
      backupId: 'snapshot-claude-20260404000000-aaaaaa',
      platform: 'claude',
      createdAt: new Date().toISOString(),
      reason: 'use',
      targetFiles: [],
    })
    const manifest = await store.readManifest('claude', 'snapshot-claude-20260404000000-aaaaaa')
    expect(manifest.manifest.backupId).toBe('snapshot-claude-20260404000000-aaaaaa')
  })
})
