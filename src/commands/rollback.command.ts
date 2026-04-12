import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { RollbackService } from '../services/rollback.service'

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback')
    .argument('[backupId]')
    .option('--json', '使用 JSON 输出')
    .action(async (backupId: string | undefined, options: { json?: boolean }) => {
      const service = new RollbackService()
      const result = await service.rollback(backupId)
      outputCommandResult(result, options.json)
    })
}
