import { ProfilesStore } from '../stores/profiles.store'
import type { Profile } from '../types/profile'

export class ProfileNotFoundError extends Error {
  constructor(selector: string) {
    super(`未找到配置档：${selector}`)
    this.name = 'ProfileNotFoundError'
  }
}

export class DuplicateProfileIdError extends Error {
  constructor(profileId: string) {
    super(`配置 ID 已存在：${profileId}`)
    this.name = 'DuplicateProfileIdError'
  }
}

export class ProfileService {
  constructor(private readonly profilesStore = new ProfilesStore()) {}

  async resolve(selector: string): Promise<Profile> {
    const profile = await this.profilesStore.findBySelector(selector)
    if (!profile) {
      throw new ProfileNotFoundError(selector)
    }

    return profile
  }

  async list(): Promise<Profile[]> {
    return this.profilesStore.list()
  }

  async add(profile: Profile): Promise<void> {
    const profiles = await this.profilesStore.list()
    if (profiles.some((item) => item.id === profile.id)) {
      throw new DuplicateProfileIdError(profile.id)
    }

    await this.profilesStore.add(profile)
  }
}
