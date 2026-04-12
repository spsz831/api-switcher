import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { SwitchService } from '../services/switch.service'

export function registerUseCommand(program: Command): void {
  program
    .command('use')
    .argument('<selector>')
    .option('--json', '使用 JSON 输出')
    .option('--force', '强制执行高风险操作')
    .option('--dry-run', '仅预览，不写入')
    .action(async (selector: string, options: { json?: boolean; force?: boolean; dryRun?: boolean }) => {
      const service = new SwitchService()
      const result = await service.use(selector, options)
      outputCommandResult(result, options.json)
    })
}
