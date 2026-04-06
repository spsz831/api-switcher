#!/usr/bin/env node
import { Command } from 'commander'
import { registerAddCommand } from '../commands/add.command'
import { registerCurrentCommand } from '../commands/current.command'
import { registerExportCommand } from '../commands/export.command'
import { registerListCommand } from '../commands/list.command'
import { registerPreviewCommand } from '../commands/preview.command'
import { registerRollbackCommand } from '../commands/rollback.command'
import { registerUseCommand } from '../commands/use.command'
import { registerValidateCommand } from '../commands/validate.command'

async function main(): Promise<void> {
  const program = new Command()

  program.name('api-switcher').description('多平台 API 配置切换 CLI').version('0.1.0')

  registerAddCommand(program)
  registerListCommand(program)
  registerUseCommand(program)
  registerCurrentCommand(program)
  registerPreviewCommand(program)
  registerValidateCommand(program)
  registerRollbackCommand(program)
  registerExportCommand(program)

  await program.parseAsync(process.argv)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : '未知错误'}\n`)
  process.exit(2)
})
