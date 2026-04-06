import type { CommandResult } from '../types/command'

export function renderJson(result: CommandResult): string {
  return JSON.stringify(result, null, 2)
}
