import type { Command } from 'commander'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { CurrentStateService } from '../services/current-state.service'
import { PLATFORM_NAMES, type PlatformName } from '../types/platform'

function assertListOptions(options: { platform?: string; json?: boolean }): asserts options is { platform?: PlatformName; json?: boolean } {
  if (options.platform && !PLATFORM_NAMES.includes(options.platform as PlatformName)) {
    throw new Error(`不支持的平台：${options.platform}`)
  }
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .option('--platform <platform>', '按平台筛选')
    .option('--json', '使用 JSON 输出')
    .action(async (options: { json?: boolean; platform?: string }) => {
      assertListOptions(options)

      const service = new CurrentStateService()
      const result = await service.list({ platform: options.platform })
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = result.ok ? 0 : 1
    })
}
