import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { PreviewService } from '../services/preview.service'
import { getScopeOptionDescription } from '../services/scope-options'

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .argument('<selector>')
    .option('--json', '使用 JSON 输出')
    .option('--scope <scope>', getScopeOptionDescription())
    .action(async (selector: string, options: { json?: boolean; scope?: string }) => {
      const service = new PreviewService()
      const result = await service.preview(selector, { scope: options.scope })
      outputCommandResult(result, options.json)
    })
}
