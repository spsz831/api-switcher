import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { ExportService } from '../services/export.service'

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .option('--json', '使用 JSON 输出')
    .option('--include-secrets', '显式包含 inline secret 明文')
    .action(async (options: { json?: boolean; includeSecrets?: boolean }) => {
      const service = new ExportService()
      const result = await service.export({
        includeSecrets: options.includeSecrets,
      })
      outputCommandResult(result, options.json)
    })
}
