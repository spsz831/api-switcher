import type { Command } from 'commander'
import { mapCommandResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { CurrentStateService } from '../services/current-state.service'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .option('--platform <platform>', '按平台筛选')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean; platform?: string }) => {
      const service = new CurrentStateService()
      const result = await service.list({ platform: options.platform })
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = mapCommandResultToExitCode(result)
    })
}
