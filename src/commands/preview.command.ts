import type { Command } from 'commander'
import { mapResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { PreviewService } from '../services/preview.service'

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .argument('<selector>')
    .option('--json', '使用 JSON 输出')
    .action(async (selector: string, options: { json?: boolean }) => {
      const service = new PreviewService()
      const result = await service.preview(selector)
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = mapResultToExitCode(result.ok)
    })
}
