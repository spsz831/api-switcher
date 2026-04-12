import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { ValidateService } from '../services/validate.service'

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .argument('[selector]')
    .option('--json', '使用 JSON 输出')
    .action(async (selector: string | undefined, options: { json?: boolean }) => {
      const service = new ValidateService()
      const result = await service.validate(selector)
      outputCommandResult(result, options.json)
    })
}
