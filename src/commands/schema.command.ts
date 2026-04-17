import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { SchemaService } from '../services/schema.service'

export function registerSchemaCommand(program: Command): void {
  program
    .command('schema')
    .description('输出 public JSON schema')
    .option('--json', '使用 JSON 输出')
    .option('--schema-version', '仅输出 public JSON schema 版本')
    .action(async (options: { json?: boolean; schemaVersion?: boolean }) => {
      const service = new SchemaService()
      outputCommandResult(
        options.schemaVersion ? service.getPublicJsonSchemaVersion() : service.getPublicJsonSchema(),
        options.json,
      )
    })
}
