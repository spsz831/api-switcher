import type { Command } from 'commander'
import { mapResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { CurrentStateService } from '../services/current-state.service'

export function registerCurrentCommand(program: Command): void {
  program
    .command('current')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean }) => {
      const service = new CurrentStateService()
      const result = await service.getCurrent()
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = mapResultToExitCode(result.ok)
    })
}
