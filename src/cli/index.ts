#!/usr/bin/env node
import { Command } from 'commander'
import { registerAddCommand } from '../commands/add.command'
import { registerCurrentCommand } from '../commands/current.command'
import { registerExportCommand } from '../commands/export.command'
import { registerImportCommand } from '../commands/import.command'
import { registerListCommand } from '../commands/list.command'
import { registerPreviewCommand } from '../commands/preview.command'
import { registerRollbackCommand } from '../commands/rollback.command'
import { registerSchemaCommand } from '../commands/schema.command'
import { registerUseCommand } from '../commands/use.command'
import { registerValidateCommand } from '../commands/validate.command'

function normalizeCliArgv(argv: string[]): string[] {
  if (argv[2] !== 'import') {
    return argv
  }

  const subcommand = argv[3]
  if (!subcommand || subcommand === 'preview' || subcommand === 'apply' || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return argv
  }

  const looksLikeLegacyFileArg = subcommand.includes('\\')
    || subcommand.includes('/')
    || subcommand.includes('.')

  if (!looksLikeLegacyFileArg) {
    return argv
  }

  return [
    ...argv.slice(0, 3),
    'preview',
    ...argv.slice(3),
  ]
}

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
  registerImportCommand(program)
  registerSchemaCommand(program)

  await program.parseAsync(normalizeCliArgv(process.argv))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : '未知错误'}\n`)
  process.exit(2)
})
