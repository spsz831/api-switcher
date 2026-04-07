import { AdapterRegistry } from '../registry/adapter-registry'
import type { CommandResult, ValidateCommandOutput } from '../types/command'
import { ProfileService } from './profile.service'

export class ValidateService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async validate(selector?: string): Promise<CommandResult<ValidateCommandOutput>> {
    const profiles = selector ? [await this.profileService.resolve(selector)] : await this.profileService.list()
    const items = await Promise.all(profiles.map(async (profile) => ({
      profileId: profile.id,
      platform: profile.platform,
      validation: await this.registry.get(profile.platform).validate(profile),
    })))

    return {
      ok: items.every((item) => item.validation.ok),
      action: 'validate',
      data: { items },
      limitations: Array.from(new Set(items.flatMap((item) => item.validation.limitations.map((issue) => issue.message)))),
    }
  }
}
