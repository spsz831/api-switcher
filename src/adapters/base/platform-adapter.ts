import { DEFAULT_CAPABILITIES } from '../../constants/platforms'
import type {
  ApplyContext,
  ApplyResult,
  BackupContext,
  BackupResult,
  CurrentProfileResult,
  PlatformAdapter,
  PreviewResult,
  RollbackContext,
  RollbackResult,
  TargetFileInfo,
  ValidationResult,
} from '../../types/adapter'
import type { PlatformName } from '../../types/platform'
import type { Profile } from '../../types/profile'

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformName

  get capabilities() {
    return DEFAULT_CAPABILITIES[this.platform]
  }

  abstract validate(profile: Profile): Promise<ValidationResult>

  abstract preview(profile: Profile): Promise<PreviewResult>

  abstract detectCurrent(profiles?: Profile[]): Promise<CurrentProfileResult | null>

  abstract listTargets(): Promise<TargetFileInfo[]>

  async backup(_context?: BackupContext): Promise<BackupResult> {
    return {
      ok: true,
      backupId: 'managed-by-snapshot-service',
      targetFiles: (await this.listTargets()).map((item) => item.path),
    }
  }

  abstract apply(profile: Profile, context: ApplyContext): Promise<ApplyResult>

  abstract rollback(snapshotId: string, context?: RollbackContext): Promise<RollbackResult>
}
