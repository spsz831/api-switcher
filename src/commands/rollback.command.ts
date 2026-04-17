import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { RollbackService } from '../services/rollback.service'
import { getScopeOptionDescription } from '../services/scope-options'

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback')
    .argument('[backupId]')
    .option('--json', '使用 JSON 输出')
    .option('--scope <scope>', getScopeOptionDescription('期望回滚的目标作用域'))
    .action(async (backupId: string | undefined, options: { json?: boolean; scope?: string }) => {
      const service = new RollbackService()
      const result = await service.rollback(backupId, { scope: options.scope })
      outputCommandResult(result, options.json)
    })
}
