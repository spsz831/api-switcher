import { readTextFile } from '../../utils/file-system'
import { normalizeGeminiContract } from './gemini.contract'
import { parseGeminiSettings } from './gemini.parser'
import { GEMINI_SCOPE_ORDER, resolveGeminiScopeTargets, type GeminiScope, type GeminiScopeTarget } from './gemini.scope-resolver'
import type { Profile } from '../../types/profile'

type GeminiScopeLayer = {
  scope: GeminiScope
  path?: string
  target: GeminiScopeTarget
  settings: Record<string, unknown>
  managed: Record<string, unknown>
}

export type GeminiScopeState = {
  targets: GeminiScopeTarget[]
  layers: GeminiScopeLayer[]
  mergedSettings: Record<string, unknown>
  mergedManaged: Record<string, unknown>
  contributors: Partial<Record<string, GeminiScope>>
}

export async function loadGeminiScopeState(): Promise<GeminiScopeState> {
  const targets = await resolveGeminiScopeTargets()
  const layers = await Promise.all(targets.map(async (target) => {
    const settings = target.path && target.status === 'available'
      ? parseGeminiSettings(await readTextFile(target.path))
      : {}
    return {
      scope: target.scope,
      path: target.path,
      target,
      settings,
      managed: pickManagedFields(settings),
    }
  }))

  const mergedSettings: Record<string, unknown> = {}
  const mergedManaged: Record<string, unknown> = {}
  const contributors: Partial<Record<string, GeminiScope>> = {}

  for (const scope of GEMINI_SCOPE_ORDER) {
    const layer = layers.find((item) => item.scope === scope)
    if (!layer) {
      continue
    }

    Object.assign(mergedSettings, layer.settings)
    for (const [key, value] of Object.entries(layer.managed)) {
      mergedManaged[key] = value
      contributors[key] = scope
    }
  }

  return {
    targets,
    layers,
    mergedSettings,
    mergedManaged,
    contributors,
  }
}

function pickManagedFields(settings: Record<string, unknown>): Record<string, unknown> {
  const syntheticProfile: Profile = {
    id: 'synthetic-gemini',
    name: 'synthetic-gemini',
    platform: 'gemini',
    source: {},
    apply: settings,
  }

  return normalizeGeminiContract(syntheticProfile).stableSettings
}
