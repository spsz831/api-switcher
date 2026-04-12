import { mapCommandResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import type { CommandResult } from '../types/command'

export function outputCommandResult(result: CommandResult, json = false): void {
  process.stdout.write(`${json ? renderJson(result) : renderText(result)}\n`)
  process.exitCode = mapCommandResultToExitCode(result)
}
