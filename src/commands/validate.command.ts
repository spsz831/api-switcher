import type { Command } from 'commander'
import { mapCommandResultToExitCode } from '../constants/exit-codes'
import { renderJson } from '../renderers/json-renderer'
import { renderText } from '../renderers/text-renderer'
import { ValidateService } from '../services/validate.service'

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .argument('[selector]')
    .option('--json', '使用 JSON 输出')
    .action(async (selector: string | undefined, options: { json?: boolean }) => {
      const service = new ValidateService()
      const result = await service.validate(selector)
      process.stdout.write(`${options.json ? renderJson(result) : renderText(result)}\n`)
      process.exitCode = mapCommandResultToExitCode(result)
    })
}
