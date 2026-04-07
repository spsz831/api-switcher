import { evaluateRisk } from '../domain/risk-engine'
import { AdapterRegistry } from '../registry/adapter-registry'
import type { AddProfileInput, AddCommandOutput, CommandResult } from '../types/command'
import { PLATFORM_NAMES, type PlatformName } from '../types/platform'
import type { Profile } from '../types/profile'
import { ProfileService } from './profile.service'

type AddServiceInput = {
  platform: string
  name: string
  key: string
  url?: string
}

export class AddService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async add(input: AddServiceInput): Promise<CommandResult<AddCommandOutput>> {
    assertAddInput(input)

    const profile = buildProfile(input)
    const adapter = this.registry.get(profile.platform)
    const validation = await adapter.validate(profile)
    const preview = await adapter.preview(profile)
    const decision = evaluateRisk(preview, validation)
    const warnings = Array.from(new Set(decision.reasons))
    const limitations = Array.from(new Set(decision.limitations))

    await this.profileService.add(profile)

    return {
      ok: true,
      action: 'add',
      data: {
        profile,
        validation,
        preview,
        risk: {
          allowed: decision.allowed,
          riskLevel: decision.riskLevel,
          reasons: warnings,
          limitations,
        },
      },
      warnings,
      limitations,
    }
  }
}

function assertAddInput(input: AddServiceInput): asserts input is AddProfileInput {
  if (!PLATFORM_NAMES.includes(input.platform as PlatformName)) {
    throw new Error(`不支持的平台：${input.platform}`)
  }

  if (input.platform === 'gemini' && input.url) {
    throw new Error('gemini 平台暂不支持 --url，请改用默认官方链路。')
  }
}

function buildProfile(input: AddProfileInput): Profile {
  const now = new Date().toISOString()

  return {
    id: `${input.platform}-${input.name}`,
    name: input.name,
    platform: input.platform,
    source: buildSource(input.platform, input.key, input.url),
    apply: buildApply(input.platform, input.key, input.url),
    meta: { createdAt: now, updatedAt: now },
  }
}

function buildSource(platform: PlatformName, key: string, url?: string): Record<string, string> {
  if (platform === 'claude') {
    return {
      token: key,
      ...(url ? { baseURL: url } : {}),
    }
  }

  if (platform === 'codex') {
    return {
      apiKey: key,
      ...(url ? { baseURL: url } : {}),
    }
  }

  return {
    apiKey: key,
    authType: 'gemini-api-key',
  }
}

function buildApply(platform: PlatformName, key: string, url?: string): Record<string, string> {
  if (platform === 'claude') {
    return {
      ANTHROPIC_AUTH_TOKEN: key,
      ...(url ? { ANTHROPIC_BASE_URL: url } : {}),
    }
  }

  if (platform === 'codex') {
    return {
      OPENAI_API_KEY: key,
      ...(url ? { base_url: url } : {}),
    }
  }

  return {
    GEMINI_API_KEY: key,
    enforcedAuthType: 'gemini-api-key',
  }
}
