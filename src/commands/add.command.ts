import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { AddService } from '../services/add.service'

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('新增一个 profile；支持明文 secret 或 reference-only 录入')
    .requiredOption('--platform <platform>', '目标平台')
    .requiredOption('--name <name>', '配置名称')
    .option('--key <key>', 'API key 或 token')
    .option('--secret-ref <ref>', 'secret 引用，例如 vault://codex/prod')
    .option('--auth-reference <reference>', '认证引用，例如 vault://codex/prod')
    .option('--url <url>', 'base url')
    .option('--json', '使用 JSON 输出')
    .addHelpText('after', `
说明:
  - 明文输入与 reference-only 输入互斥
  - add 只记录 reference 输入，不验证当前环境能否解析
  - reference 的可执行性与治理判断请在 preview/use/import apply 阶段查看
`)
    .action(async (options: {
      platform: string
      name: string
      key?: string
      secretRef?: string
      authReference?: string
      url?: string
      json?: boolean
    }) => {
      const service = new AddService()
      const result = await service.add(options)
      outputCommandResult(result, options.json)
    })
}
