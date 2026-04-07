import { collectIssueMessages, collectSecretReferences } from '../domain/masking'
import { AdapterRegistry } from '../registry/adapter-registry'
import type { CommandResult, ExportCommandOutput } from '../types/command'
import type { ValidationResult } from '../types/adapter'
import { ProfileService } from './profile.service'

function withFallbackSecretReferences(validation: ValidationResult, profileApply: Record<string, unknown>): ValidationResult {
  return validation.secretReferences
    ? validation
    : {
        ...validation,
        secretReferences: collectSecretReferences(profileApply),
      }
}

export class ExportService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async export(): Promise<CommandResult<ExportCommandOutput>> {
    const profiles = await this.profileService.list()
    const exportedProfiles = await Promise.all(profiles.map(async (profile) => {
      const validation = withFallbackSecretReferences(
        await this.registry.get(profile.platform).validate(profile),
        profile.apply,
      )

      return {
        profile,
        validation,
      }
    }))

    return {
      ok: true,
      action: 'export',
      data: {
        profiles: exportedProfiles,
      },
      limitations: Array.from(new Set(exportedProfiles.flatMap((profile) => collectIssueMessages(profile.validation?.limitations ?? [])))),
    }
  }
}
