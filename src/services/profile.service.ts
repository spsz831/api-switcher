import { ProfilesStore } from '../stores/profiles.store'
import type { Profile } from '../types/profile'

export class ProfileService {
  constructor(private readonly profilesStore = new ProfilesStore()) {}

  async resolve(selector: string): Promise<Profile> {
    const profile = await this.profilesStore.findBySelector(selector)
    if (!profile) {
      throw new Error(`未找到配置档：${selector}`)
    }

    return profile
  }

  async list(): Promise<Profile[]> {
    return this.profilesStore.list()
  }

  async add(profile: Profile): Promise<void> {
    const profiles = await this.profilesStore.list()
    if (profiles.some((item) => item.id === profile.id)) {
      throw new Error(`配置 ID 已存在：${profile.id}`)
    }

    await this.profilesStore.add(profile)
  }
}
