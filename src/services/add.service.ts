import { evaluateRisk } from '../domain/risk-engine'
import {
  withProfileSecretReferenceContract,
} from '../domain/secret-inspection'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { AddProfileInput, AddCommandOutput, CommandResult } from '../types/command'
import { PLATFORM_NAMES, type PlatformName } from '../types/platform'
import type { Profile } from '../types/profile'
import { DuplicateProfileIdError, ProfileService } from './profile.service'
import { getScopeCapabilityMatrix } from './scope-options'
import { buildPlatformSummary } from './platform-summary'
import { buildSingleProfileCommandSummary } from './single-profile-command-summary'

type AddServiceInput = {
  platform: string
  name: string
  key?: string
  secretRef?: string
  authReference?: string
  url?: string
}

class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(`不支持的平台：${platform}`)
    this.name = 'UnsupportedPlatformError'
  }
}

class GeminiUrlUnsupportedError extends Error {
  constructor() {
    super('gemini 平台暂不支持 --url，请改用默认官方链路。')
    this.name = 'GeminiUrlUnsupportedError'
  }
}

class AddInputConflictError extends Error {
  constructor() {
    super('不能同时提供 --key 与 --secret-ref/--auth-reference。')
    this.name = 'AddInputConflictError'
  }
}

class AddInputRequiredError extends Error {
  constructor() {
    super('必须提供 --key 或 --secret-ref/--auth-reference 其中之一。')
    this.name = 'AddInputRequiredError'
  }
}

export class AddService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async add(input: AddServiceInput): Promise<CommandResult<AddCommandOutput>> {
    try {
      assertAddInput(input)

      const profile = buildProfile(input)
      const adapter = this.registry.get(profile.platform)
      const validation = withProfileSecretReferenceContract(await adapter.validate(profile), profile)
      const preview = await adapter.preview(profile)
      const decision = evaluateRisk(preview, validation)
      const risk = {
        allowed: decision.allowed,
        riskLevel: decision.riskLevel,
        reasons: Array.from(new Set(decision.reasons)),
        limitations: Array.from(new Set(decision.limitations)),
      }

      const summary = buildSingleProfileCommandSummary({
        platform: profile.platform,
        profileId: profile.id,
        profile,
        warningCount: risk.reasons.length,
        limitationCount: risk.limitations.length,
        changedFileCount: preview.diffSummary.filter((item) => item.hasChanges).length,
        backupCreated: preview.backupPlanned,
        noChanges: preview.noChanges,
        platformSummary: buildPlatformSummary(profile.platform, {
          composedFiles: preview.targetFiles.map((item) => item.path),
          listMode: true,
        }),
        warnings: risk.reasons,
        limitations: risk.limitations,
      })

      await this.profileService.add(profile)

      return {
        ok: true,
        action: 'add',
        data: {
          profile,
          validation,
          preview,
          risk,
          summary,
          scopeCapabilities: getScopeCapabilityMatrix(profile.platform),
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'add',
        error: {
          code: mapAddErrorCode(error),
          message: error instanceof Error ? error.message : 'add 执行失败',
        },
      }
    }
  }
}

function assertAddInput(input: AddServiceInput): asserts input is AddProfileInput {
  if (!PLATFORM_NAMES.includes(input.platform as PlatformName)) {
    throw new UnsupportedPlatformError(input.platform)
  }

  const hasKey = hasProvidedInputValue(input.key)
  const hasReference = hasProvidedInputValue(input.secretRef) || hasProvidedInputValue(input.authReference)

  if (hasKey && hasReference) {
    throw new AddInputConflictError()
  }

  if (!hasKey && !hasReference) {
    throw new AddInputRequiredError()
  }

  if (input.platform === 'gemini' && input.url) {
    throw new GeminiUrlUnsupportedError()
  }
}

function hasProvidedInputValue(value: unknown): boolean {
  return typeof value === 'string'
}

function mapAddErrorCode(error: unknown): string {
  if (error instanceof UnsupportedPlatformError) {
    return 'UNSUPPORTED_PLATFORM'
  }

  if (error instanceof GeminiUrlUnsupportedError) {
    return 'GEMINI_URL_UNSUPPORTED'
  }

  if (error instanceof AddInputConflictError) {
    return 'ADD_INPUT_CONFLICT'
  }

  if (error instanceof AddInputRequiredError) {
    return 'ADD_INPUT_REQUIRED'
  }

  if (error instanceof DuplicateProfileIdError) {
    return 'DUPLICATE_PROFILE_ID'
  }

  if (error instanceof AdapterNotRegisteredError) {
    return 'ADAPTER_NOT_REGISTERED'
  }

  return 'ADD_FAILED'
}

function buildProfile(input: AddProfileInput): Profile {
  const now = new Date().toISOString()

  return {
    id: `${input.platform}-${input.name}`,
    name: input.name,
    platform: input.platform,
    source: buildSource(input.platform, input, input.url),
    apply: buildApply(input.platform, input, input.url),
    meta: { createdAt: now, updatedAt: now },
  }
}

function buildSource(platform: PlatformName, input: AddProfileInput, url?: string): Record<string, string> {
  if (!input.key) {
    return buildReferenceSource(platform, input, url)
  }

  if (platform === 'claude') {
    return {
      token: input.key,
      ...(url ? { baseURL: url } : {}),
    }
  }

  if (platform === 'codex') {
    return {
      apiKey: input.key,
      ...(url ? { baseURL: url } : {}),
    }
  }

  return {
    apiKey: input.key,
    authType: 'gemini-api-key',
  }
}

function buildApply(platform: PlatformName, input: AddProfileInput, url?: string): Record<string, string> {
  if (!input.key) {
    return buildReferenceApply(platform, input, url)
  }

  if (platform === 'claude') {
    return {
      ANTHROPIC_AUTH_TOKEN: input.key,
      ...(url ? { ANTHROPIC_BASE_URL: url } : {}),
    }
  }

  if (platform === 'codex') {
    return {
      OPENAI_API_KEY: input.key,
      ...(url ? { base_url: url } : {}),
    }
  }

  return {
    GEMINI_API_KEY: input.key,
    enforcedAuthType: 'gemini-api-key',
  }
}

function buildReferenceSource(
  platform: PlatformName,
  input: AddProfileInput,
  url?: string,
): Record<string, string> {
  return {
    secret_ref: input.secretRef ?? input.authReference ?? '',
    ...(url && platform !== 'gemini' ? { baseURL: url } : {}),
    ...(platform === 'gemini' ? { authType: 'gemini-api-key' } : {}),
  }
}

function buildReferenceApply(
  platform: PlatformName,
  input: AddProfileInput,
  url?: string,
): Record<string, string> {
  return {
    auth_reference: input.authReference ?? input.secretRef ?? '',
    ...(platform === 'claude' && url ? { ANTHROPIC_BASE_URL: url } : {}),
    ...(platform === 'codex' && url ? { base_url: url } : {}),
    ...(platform === 'gemini' ? { enforcedAuthType: 'gemini-api-key' } : {}),
  }
}
