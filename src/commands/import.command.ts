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
    .option('--profile <id>', '要应用的单个导入 profile ID')
    .option('--profiles <ids>', '要顺序应用的同平台导入 profile ID 列表，使用逗号分隔')
    .option('--scope <scope>', getScopeOptionDescription())
    .option('--force', '强制执行高风险操作')
    .option('--dry-run', '执行完整 apply 前检查，但不写入文件、不创建备份')
    .option('--json', '使用 JSON 输出')
    .action(async (
      file: string,
      options: { profile?: string; profiles?: string; scope?: string; force?: boolean; dryRun?: boolean; json?: boolean },
    ) => {
      const service = new ImportApplyService()
      if (options.profile && options.profiles) {
        throw new Error('--profile 与 --profiles 不能同时使用')
      }

      if (options.profiles) {
        const profiles = options.profiles.split(',').map((item) => item.trim()).filter(Boolean)
        if (profiles.length === 0) {
          throw new Error('--profiles 至少需要一个 profile ID')
        }

        const result = await service.applyMany(file, {
          profiles,
          scope: options.scope,
          force: options.force,
          dryRun: options.dryRun,
        })
        outputCommandResult(result, options.json)
        return
      }

      if (!options.profile) {
        throw new Error("required option '--profile <id>' not specified")
      }

      const result = await service.apply(file, {
        profile: options.profile,
        scope: options.scope,
        force: options.force,
        dryRun: options.dryRun,
      })
      outputCommandResult(result, options.json)
    })
}
