import type { Command } from 'commander'
import { mapResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { RollbackService } from '../services/rollback.service'

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback')
    .argument('[backupId]')
    .option('--json', '使用 JSON 输出')
    .action(async (backupId: string | undefined, options: { json?: boolean }) => {
      const service = new RollbackService()
      const result = await service.rollback(backupId)
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = mapResultToExitCode(result.ok)
    })
}
