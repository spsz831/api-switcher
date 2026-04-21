import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { AddService } from '../services/add.service'

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .requiredOption('--platform <platform>', '目标平台')
    .requiredOption('--name <name>', '配置名称')
    .option('--key <key>', 'API key 或 token')
    .option('--secret-ref <ref>', 'secret 引用，例如 vault://codex/prod')
    .option('--auth-reference <reference>', '认证引用，例如 vault://codex/prod')
    .option('--url <url>', 'base url')
    .option('--json', '使用 JSON 输出')
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
