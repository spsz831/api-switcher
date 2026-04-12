import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { CurrentStateService } from '../services/current-state.service'

export function registerCurrentCommand(program: Command): void {
  program
    .command('current')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean }) => {
      const service = new CurrentStateService()
      const result = await service.getCurrent()
      outputCommandResult(result, options.json)
    })
}
