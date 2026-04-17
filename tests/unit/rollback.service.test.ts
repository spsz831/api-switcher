import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdapterNotRegisteredError } from '../../src/registry/adapter-registry'
import { RollbackService } from '../../src/services/rollback.service'
import { SnapshotStore } from '../../src/stores/snapshot.store'
import { StateStore } from '../../src/stores/state.store'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-rollback-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('rollback service', () => {
  it('没有可回滚快照时返回 BACKUP_NOT_FOUND', async () => {
    const result = await new RollbackService().rollback()

    expect(result).toEqual({
      ok: false,
      action: 'rollback',
      error: {
        code: 'BACKUP_NOT_FOUND',
        message: '没有可回滚的快照。',
      },
    })
  })

  it('backupId 非法时返回结构化失败结果', async () => {
    const result = await new RollbackService().rollback('invalid-backup-id')

    expect(result).toEqual({
      ok: false,
      action: 'rollback',
      error: {
        code: 'INVALID_BACKUP_ID',
        message: '无法从 backupId 推断平台：invalid-backup-id',
      },
    })
  })

  it('未注册平台适配器时返回结构化失败结果', async () => {
    const backupId = 'snapshot-gemini-20260409121100-abcdef'

    const result = await new RollbackService(
      {
        get: () => {
          throw new AdapterNotRegisteredError('gemini')
        },
      } as any,
      {
        readManifest: async () => ({
          manifest: {
            backupId,
            platform: 'gemini',
            profileId: 'gemini-prod',
            createdAt: '2026-04-09T12:11:00.000Z',
            reason: 'use',
            targetFiles: [],
          },
          directoryPath: path.join(runtimeDir, 'backups', 'gemini', backupId),
        }),
      } as any,
      {
        read: async () => ({
          current: { gemini: 'gemini-prod' },
          snapshots: [],
        }),
      } as any,
    ).rollback(backupId)

    expect(result).toEqual({
      ok: false,
      action: 'rollback',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：gemini',
      },
    })
  })

  it('adapter rollback 失败时返回 ROLLBACK_FAILED，并透传 explainable 摘要', async () => {
    const backupId = 'snapshot-gemini-20260409121000-abcdef'
    let markCurrentCalled = false
    let clearCurrentCalled = false

    const result = await new RollbackService(
      {
        get: () => ({
          detectCurrent: async () => ({
            scopeAvailability: [
              {
                scope: 'project',
                status: 'available',
                detected: true,
                writable: true,
                path: path.join(runtimeDir, 'workspace', '.gemini', 'settings.json'),
              },
            ],
          }),
          rollback: async () => ({
            ok: false,
            backupId,
            restoredFiles: [],
            warnings: [
              {
                code: 'rollback-warning-1',
                level: 'warning',
                message: 'rollback warning',
              },
            ],
            limitations: [
              {
                code: 'rollback-limitation-1',
                level: 'limitation',
                message: 'rollback limitation',
              },
            ],
          }),
        }),
      } as any,
      {
        readManifest: async () => ({
          manifest: {
            backupId,
            platform: 'gemini',
            profileId: 'gemini-prod',
            previousProfileId: 'gemini-old',
            createdAt: '2026-04-09T12:10:00.000Z',
            reason: 'use',
            targetFiles: [],
          },
          directoryPath: path.join(runtimeDir, 'backups', 'gemini', backupId),
        }),
      } as any,
      {
        read: async () => ({
          current: { gemini: 'gemini-prod' },
          snapshots: [],
        }),
        markCurrent: async () => {
          markCurrentCalled = true
        },
        clearCurrent: async () => {
          clearCurrentCalled = true
        },
      } as any,
    ).rollback(backupId)

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'rollback',
      error: expect.objectContaining({
        code: 'ROLLBACK_FAILED',
        message: '回滚失败',
      }),
    }))
    expect(result.error?.details).toEqual(expect.objectContaining({
      rollback: expect.objectContaining({
        ok: false,
        backupId,
      }),
      scopePolicy: {
        requestedScope: undefined,
        resolvedScope: 'user',
        defaultScope: 'user',
        explicitScope: false,
        highRisk: false,
        riskWarning: undefined,
        rollbackScopeMatchRequired: true,
      },
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          use: true,
          rollback: true,
          risk: 'high',
        }),
        expect.objectContaining({
          scope: 'system-overrides',
          use: false,
          rollback: false,
        }),
      ]),
      scopeAvailability: undefined,
    }))
    expect(result.warnings).toEqual(['rollback warning'])
    expect(result.limitations).toEqual(['rollback limitation'])
    expect(markCurrentCalled).toBe(false)
    expect(clearCurrentCalled).toBe(false)
  })

  it('成功回滚后 summary 与状态记录中的摘要一致', async () => {
    const backupId = 'snapshot-gemini-20260409120000-abcdef'
    const snapshotStore = new SnapshotStore()
    const stateStore = new StateStore()

    await snapshotStore.writeManifest('gemini', backupId, {
      backupId,
      platform: 'gemini',
      profileId: 'gemini-prod',
      previousProfileId: 'gemini-prod',
      createdAt: '2026-04-09T12:00:00.000Z',
      reason: 'use',
      targetFiles: [],
      warnings: ['manifest warning'],
      limitations: ['manifest limitation'],
    })
    await stateStore.write({
      current: { gemini: 'gemini-prod' },
      lastSwitch: {
        platform: 'gemini',
        profileId: 'gemini-prod',
        backupId,
        time: '2026-04-09T12:00:00.000Z',
        status: 'success',
      },
      snapshots: [],
    })

    const result = await new RollbackService().rollback(backupId)
    const nextState = await stateStore.read()

    expect(result.ok).toBe(true)
    expect(result.action).toBe('rollback')
    expect(result.data?.backupId).toBe(backupId)
    expect(result.data?.scopePolicy).toBeUndefined()
    expect(result.data?.summary).toEqual({
      warnings: result.warnings ?? [],
      limitations: result.limitations ?? [],
    })
    expect(nextState.lastSwitch?.status).toBe('rolled-back')
    expect(nextState.lastSwitch?.warnings).toEqual(result.data?.summary.warnings)
    expect(nextState.lastSwitch?.limitations).toEqual(result.data?.summary.limitations)
  })

  it('manifest 带 provenance 时不改变 rollback 既有判定与返回结构', async () => {
    const backupId = 'snapshot-gemini-20260409120100-fedcba'
    const snapshotStore = new SnapshotStore()
    const stateStore = new StateStore()

    await snapshotStore.writeManifest('gemini', backupId, {
      backupId,
      platform: 'gemini',
      profileId: 'gemini-prod',
      previousProfileId: 'gemini-prod',
      createdAt: '2026-04-09T12:01:00.000Z',
      reason: 'use',
      provenance: {
        origin: 'import-apply',
        sourceFile: 'imports/gemini-prod.json',
        importedProfileId: 'gemini-imported',
      },
      targetFiles: [],
      warnings: ['manifest warning'],
      limitations: ['manifest limitation'],
    })
    await stateStore.write({
      current: { gemini: 'gemini-prod' },
      lastSwitch: {
        platform: 'gemini',
        profileId: 'gemini-prod',
        backupId,
        time: '2026-04-09T12:01:00.000Z',
        status: 'success',
      },
      snapshots: [],
    })

    const result = await new RollbackService().rollback(backupId)

    expect(result.ok).toBe(true)
    expect(result.action).toBe('rollback')
    expect(result.data?.backupId).toBe(backupId)
    expect(result.data?.scopePolicy).toBeUndefined()
    expect(result.data?.summary).toEqual({
      warnings: result.warnings ?? [],
      limitations: result.limitations ?? [],
    })
  })

  it('Gemini project scope 不可解析时先返回 availability 失败而不是继续回滚', async () => {
    const backupId = 'snapshot-gemini-20260409120500-abcdef'
    let rollbackCalled = false

    const result = await new RollbackService(
      {
        get: () => ({
          detectCurrent: async () => ({
            scopeAvailability: [
              {
                scope: 'project',
                status: 'unresolved',
                detected: false,
                writable: false,
                reasonCode: 'PROJECT_ROOT_UNRESOLVED',
                reason: 'Gemini project scope 不可用：无法解析 project root。',
                remediation: '设置有效的 Gemini project root 后再重试。',
              },
            ],
          }),
          rollback: async () => {
            rollbackCalled = true
            return {
              ok: true,
              backupId,
              restoredFiles: [],
            }
          },
        }),
      } as any,
      {
        readManifest: async () => ({
          manifest: {
            backupId,
            platform: 'gemini',
            profileId: 'gemini-prod',
            createdAt: '2026-04-09T12:05:00.000Z',
            reason: 'use',
            targetFiles: [],
          },
          directoryPath: path.join(runtimeDir, 'backups', 'gemini', backupId),
        }),
      } as any,
      {
        read: async () => ({
          current: { gemini: 'gemini-prod' },
          snapshots: [],
        }),
      } as any,
    ).rollback(backupId, { scope: 'project' })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'rollback',
      error: expect.objectContaining({
        code: 'ROLLBACK_FAILED',
        message: 'Gemini project scope 不可用：无法解析 project root。',
        details: expect.objectContaining({
          scopePolicy: {
            requestedScope: 'project',
            resolvedScope: 'project',
            defaultScope: 'user',
            explicitScope: true,
            highRisk: true,
            riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
            rollbackScopeMatchRequired: true,
          },
          scopeAvailability: expect.arrayContaining([
            expect.objectContaining({
              scope: 'project',
              status: 'unresolved',
              reasonCode: 'PROJECT_ROOT_UNRESOLVED',
            }),
          ]),
        }),
      }),
    }))
    expect(rollbackCalled).toBe(false)
  })
})
