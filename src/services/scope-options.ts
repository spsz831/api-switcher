import { DEFAULT_CAPABILITIES } from '../constants/platforms'
import { SUPPORTED_PLATFORMS } from '../constants/platforms'
import type { PlatformScopeCapability } from '../types/capabilities'
import type { PlatformName } from '../types/platform'
import type { SnapshotScopePolicy } from '../types/snapshot'

export class InvalidScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidScopeError'
  }
}

function getScopePolicy(platform: PlatformName) {
  return DEFAULT_CAPABILITIES[platform].scopePolicy
}

export function getScopeCapabilityMatrix(platform: PlatformName): PlatformScopeCapability[] {
  const policy = getScopePolicy(platform)
  if (!policy) {
    return []
  }

  if (policy.scopeCapabilities) {
    return policy.scopeCapabilities.map((item) => ({
      ...item,
      risk: item.risk ?? 'normal',
      confirmationRequired: item.confirmationRequired ?? false,
    }))
  }

  return (policy.writeScopes ?? []).map((scope) => ({
    scope,
    detect: true,
    preview: true,
    use: true,
    rollback: true,
    writable: true,
    risk: policy.highRiskScopes?.includes(scope) ? 'high' : 'normal',
    confirmationRequired: policy.highRiskScopes?.includes(scope) ?? false,
    note: policy.writeWarnings?.[scope],
  }))
}

function getScopeCapability(platform: PlatformName, scope: string): PlatformScopeCapability | undefined {
  return getScopeCapabilityMatrix(platform).find((item) => item.scope === scope)
}

function getWritableScopes(platform: PlatformName): string[] {
  return getScopeCapabilityMatrix(platform)
    .filter((item) => item.use && item.writable)
    .map((item) => item.scope)
}

function isAllowedScope(platform: PlatformName, scope: string): boolean {
  const capability = getScopeCapability(platform, scope)
  return Boolean(capability?.use && capability.writable)
}

export function assertTargetScope(platform: PlatformName, scope?: string): void {
  if (!scope) {
    return
  }

  const policy = getScopePolicy(platform)
  if (!policy) {
    throw new InvalidScopeError(`当前平台不支持 --scope。收到：${scope}`)
  }

  if (policy && !isAllowedScope(platform, scope)) {
    throw new InvalidScopeError(`${policy.invalidScopeMessage}收到：${scope}`)
  }
}

export function resolveTargetScope(platform: PlatformName, input?: string): string | undefined {
  const policy = getScopePolicy(platform)
  if (!policy) {
    return input
  }

  if (input && isAllowedScope(platform, input)) {
    return input
  }

  const envScope = policy.envDefaultScopeVar ? process.env[policy.envDefaultScopeVar] : undefined
  if (envScope && isAllowedScope(platform, envScope)) {
    return envScope
  }

  return policy.defaultScope
}

export function isHighRiskTargetScope(platform: PlatformName, scope?: string): boolean {
  const resolved = scope ? resolveTargetScope(platform, scope) : resolveTargetScope(platform)
  if (!resolved) {
    return false
  }

  const capability = getScopeCapability(platform, resolved)
  return capability?.risk === 'high' || getScopePolicy(platform)?.highRiskScopes?.includes(resolved) || false
}

export function getTargetScopeWarning(platform: PlatformName, scope?: string): string | undefined {
  const resolved = scope ? resolveTargetScope(platform, scope) : resolveTargetScope(platform)
  if (!resolved) {
    return undefined
  }

  return getScopePolicy(platform)?.writeWarnings?.[resolved] ?? getScopeCapability(platform, resolved)?.note
}

export function requiresRollbackScopeMatch(platform: PlatformName): boolean {
  return getScopePolicy(platform)?.rollbackRequiresScopeMatch ?? false
}

export function buildSnapshotScopePolicy(
  platform: PlatformName,
  options: {
    requestedScope?: string
    resolvedScope?: string
  } = {},
): SnapshotScopePolicy | undefined {
  const policy = getScopePolicy(platform)
  if (!policy) {
    return undefined
  }

  const resolvedScope = options.resolvedScope ?? resolveTargetScope(platform, options.requestedScope)
  return {
    requestedScope: options.requestedScope,
    resolvedScope,
    defaultScope: policy.defaultScope,
    explicitScope: Boolean(options.requestedScope),
    highRisk: isHighRiskTargetScope(platform, resolvedScope),
    riskWarning: getTargetScopeWarning(platform, resolvedScope),
    rollbackScopeMatchRequired: policy.rollbackRequiresScopeMatch ?? false,
  }
}

export function formatScopeSupportSummary(): string {
  return SUPPORTED_PLATFORMS
    .map((platform) => {
      const policy = getScopePolicy(platform)
      const writableScopes = getWritableScopes(platform)
      const label = platform[0]?.toUpperCase() + platform.slice(1)
      return `${label}: ${policy && writableScopes.length > 0 ? writableScopes.join('/') : '不使用 --scope'}`
    })
    .join('; ')
}

export function getScopeOptionDescription(prefix = '目标作用域'): string {
  return `${prefix}（${formatScopeSupportSummary()}）`
}

function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no'
}

function formatRisk(item: PlatformScopeCapability): string {
  const risk = item.risk ?? 'normal'
  return item.confirmationRequired ? `${risk}, requires \`--force\`` : risk
}

export function formatScopeCapabilityMatrix(platform: PlatformName): string {
  const matrix = getScopeCapabilityMatrix(platform)
  if (matrix.length === 0) {
    return '当前平台不使用 scoped target。'
  }

  return [
    '| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...matrix.map((item) => [
      `| \`${item.scope}\``,
      formatBoolean(item.detect),
      formatBoolean(item.preview),
      formatBoolean(item.use && item.writable),
      formatBoolean(item.rollback),
      formatRisk(item),
      `${item.note ?? ''} |`,
    ].join(' | ')),
  ].join('\n')
}
