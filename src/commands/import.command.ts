import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { ImportApplyService } from '../services/import-apply.service'
import { ImportPreviewService } from '../services/import-preview.service'
import { getScopeOptionDescription } from '../services/scope-options'

export function registerImportCommand(program: Command): void {
  const importCommand = program
    .command('import')
    .description('从导出文件预览或应用配置')

  importCommand
    .command('preview')
    .argument('<file>', 'export --json 导出的文件路径')
    .option('--json', '使用 JSON 输出')
    .action(async (file: string, options: { json?: boolean }) => {
      const service = new ImportPreviewService()
      const result = await service.preview(file)
      outputCommandResult(result, options.json)
    })

  importCommand
    .command('apply')
    .argument('<file>', 'export --json 导出的文件路径')
    .requiredOption('--profile <id>', '要应用的导入 profile ID')
    .option('--scope <scope>', getScopeOptionDescription())
    .option('--force', '强制执行高风险操作')
    .option('--json', '使用 JSON 输出')
    .action(async (
      file: string,
      options: { profile: string; scope?: string; force?: boolean; json?: boolean },
    ) => {
      const service = new ImportApplyService()
      const result = await service.apply(file, {
        profile: options.profile,
        scope: options.scope,
        force: options.force,
      })
      outputCommandResult(result, options.json)
    })
}
