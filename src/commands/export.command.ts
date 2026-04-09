import type { Command } from 'commander'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { ExportService } from '../services/export.service'

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean }) => {
      const service = new ExportService()
      const result = await service.export()
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = result.ok ? 0 : 1
    })
}
