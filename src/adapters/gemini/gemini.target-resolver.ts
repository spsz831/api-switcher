import { resolveGeminiScopePath, resolveGeminiScopeTargets } from './gemini.scope-resolver'

export function resolveGeminiSettingsPath(): string {
  return resolveGeminiScopePath('user')
}

export const resolveGeminiTargets = resolveGeminiScopeTargets
