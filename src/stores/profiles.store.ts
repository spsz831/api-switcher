import { atomicWrite } from '../utils/atomic-write'
import { readJsonFile } from '../utils/file-system'
import { getRuntimePaths } from '../utils/runtime-paths'
import type { Profile, ProfilesFile } from '../types/profile'

const DEFAULT_PROFILES_FILE: ProfilesFile = {
  version: 1,
  profiles: [],
}

export class ProfilesStore {
  async read(): Promise<ProfilesFile> {
    return readJsonFile<ProfilesFile>(getRuntimePaths().profilesFile, DEFAULT_PROFILES_FILE)
  }

  async write(data: ProfilesFile): Promise<void> {
    await atomicWrite(getRuntimePaths().profilesFile, JSON.stringify(data, null, 2))
  }

  async list(): Promise<Profile[]> {
    const file = await this.read()
    return file.profiles
  }

  async findBySelector(selector: string): Promise<Profile | undefined> {
    const profiles = await this.list()
    return profiles.find((profile) => profile.id === selector || profile.name === selector)
  }

  async add(profile: Profile): Promise<void> {
    const file = await this.read()
    file.profiles.push(profile)
    await this.write(file)
  }
}
