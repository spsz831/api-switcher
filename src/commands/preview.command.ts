import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { PreviewService } from '../services/preview.service'

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .argument('<selector>')
    .option('--json', '使用 JSON 输出')
    .action(async (selector: string, options: { json?: boolean }) => {
      const service = new PreviewService()
      const result = await service.preview(selector)
      outputCommandResult(result, options.json)
    })
}
