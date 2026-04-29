import os from 'node:os'
import path from 'node:path'
import type { PreviewResult } from '../types/adapter'

const REAL_USER_TARGET_WARNING = '当前写入目标命中真实用户目录；继续执行前请再次确认这不是开发态误写。'
const REAL_USER_TARGET_LIMITATION = '目标文件位于真实用户目录（例如 C:/Users/...）；如需继续，请显式使用 --force 并确认影响范围。'

function normalizePath(input: string): string {
  return path.resolve(input)
}

function isWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const normalizedDirectory = normalizePath(directoryPath)
  const normalizedTarget = normalizePath(targetPath)
  return normalizedTarget === normalizedDirectory || normalizedTarget.startsWith(`${normalizedDirectory}${path.sep}`)
}

function getRealUserTargetRoots(): string[] {
  const homeDirectory = os.homedir()
  return [
    path.join(homeDirectory, '.codex'),
    path.join(homeDirectory, '.claude'),
    path.join(homeDirectory, '.gemini'),
  ]
}

export function hitsRealUserTarget(preview: PreviewResult): boolean {
  const roots = getRealUserTargetRoots()
  return preview.targetFiles.some((target) =>
    typeof target.path === 'string'
    && target.path.length > 0
    && roots.some((root) => isWithinDirectory(target.path, root)))
}

export function getRealUserTargetGuardMessages(preview: PreviewResult): { warning?: string; limitation?: string } {
  if (!hitsRealUserTarget(preview)) {
    return {}
  }

  return {
    warning: REAL_USER_TARGET_WARNING,
    limitation: REAL_USER_TARGET_LIMITATION,
  }
}
