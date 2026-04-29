import path from 'node:path'
import { resolveRuntimeRoot } from './runtime-paths'

function normalizePath(input: string): string {
  return path.resolve(input)
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function shouldUseDevelopmentSandbox(): boolean {
  if (isTruthy(process.env.API_SWITCHER_DISABLE_DEVELOPMENT_SANDBOX)) {
    return false
  }

  if (isTruthy(process.env.API_SWITCHER_ALLOW_REAL_USER_TARGETS)) {
    return false
  }

  if (!process.env.API_SWITCHER_RUNTIME_DIR) {
    return false
  }

  return true
}

export function resolveDevelopmentSandboxPath(...segments: string[]): string {
  return path.join(resolveRuntimeRoot(), 'targets', ...segments)
}

export function isInsideDevelopmentSandbox(targetPath: string): boolean {
  const sandboxRoot = `${normalizePath(resolveDevelopmentSandboxPath())}${path.sep}`
  const normalizedTarget = normalizePath(targetPath)
  return normalizedTarget === normalizePath(resolveDevelopmentSandboxPath())
    || normalizedTarget.startsWith(sandboxRoot)
}
