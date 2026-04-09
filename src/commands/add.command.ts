import type { Command } from 'commander'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { AddService } from '../services/add.service'

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .requiredOption('--platform <platform>', '目标平台')
    .requiredOption('--name <name>', '配置名称')
    .requiredOption('--key <key>', 'API key 或 token')
    .option('--url <url>', 'base url')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { platform: string; name: string; key: string; url?: string; json?: boolean }) => {
      const service = new AddService()
      const result = await service.add(options)
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = result.ok ? 0 : 1
    })
}
