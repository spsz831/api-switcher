import { atomicWrite } from '../utils/atomic-write'
import { readJsonFile } from '../utils/file-system'
import { getRuntimePaths } from '../utils/runtime-paths'
import type { PlatformName } from '../types/platform'
import type { LastSwitchRecord, StateFile, StateWriteContext } from '../types/state'

const DEFAULT_STATE_FILE: StateFile = {
  current: {},
  snapshots: [],
}

export class StateStore {
  async read(): Promise<StateFile> {
    return readJsonFile<StateFile>(getRuntimePaths().stateFile, DEFAULT_STATE_FILE)
  }

  async write(data: StateFile): Promise<void> {
    await atomicWrite(getRuntimePaths().stateFile, JSON.stringify(data, null, 2))
  }

  async markCurrent(
    platform: PlatformName,
    profileId: string,
    backupId: string,
    status: LastSwitchRecord['status'] = 'success',
    context: StateWriteContext = {},
  ): Promise<void> {
    const state = await this.read()
    state.current[platform] = profileId
    state.lastSwitch = {
      platform,
      profileId,
      backupId,
      time: new Date().toISOString(),
      status,
      warnings: context.warnings,
      limitations: context.limitations,
    }
    await this.write(state)
  }

  async clearCurrent(
    platform: PlatformName,
    backupId: string,
    status: LastSwitchRecord['status'] = 'rolled-back',
    context: StateWriteContext = {},
  ): Promise<void> {
    const state = await this.read()
    delete state.current[platform]
    state.lastSwitch = {
      platform,
      profileId: 'unknown',
      backupId,
      time: new Date().toISOString(),
      status,
      warnings: context.warnings,
      limitations: context.limitations,
    }
    await this.write(state)
  }

  async addSnapshotIndex(entry: StateFile['snapshots'][number]): Promise<void> {
    const state = await this.read()
    state.snapshots.unshift(entry)
    await this.write(state)
  }
}
