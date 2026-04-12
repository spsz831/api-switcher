import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { CurrentStateService } from '../services/current-state.service'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .option('--platform <platform>', '按平台筛选')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean; platform?: string }) => {
      const service = new CurrentStateService()
      const result = await service.list({ platform: options.platform })
      outputCommandResult(result, options.json)
    })
}
