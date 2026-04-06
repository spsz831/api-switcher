import { collectSecretReferences } from '../domain/masking'
import { AdapterRegistry } from '../registry/adapter-registry'
import type { CommandResult, ExportCommandOutput } from '../types/command'
import { ProfileService } from './profile.service'

export class ExportService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async export(): Promise<CommandResult<ExportCommandOutput>> {
    const profiles = await this.profileService.list()
    const exportedProfiles = await Promise.all(profiles.map(async (profile) => {
      const validation = await this.registry.get(profile.platform).validate(profile)

      return {
        profile,
        limitations: this.profileService.getLimitations(profile.platform),
        managedBoundaries: validation.managedBoundaries,
        secretReferences: validation.secretReferences ?? collectSecretReferences(profile.apply),
      }
    }))

    return {
      ok: true,
      action: 'export',
      data: {
        profiles: exportedProfiles,
      },
      limitations: Array.from(new Set(profiles.flatMap((profile) => this.profileService.getLimitations(profile.platform)))),
    }
  }
}
