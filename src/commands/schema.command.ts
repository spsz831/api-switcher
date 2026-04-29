import type { Command } from 'commander'
import { outputCommandResult } from './output-command-result'
import { SchemaService } from '../services/schema.service'

export function registerSchemaCommand(program: Command): void {
  program
    .command('schema')
    .description('输出 public JSON schema；先用 --catalog-summary 做轻量发现，再按需切完整 catalog；只读默认消费路径见 consumerProfiles[].defaultConsumerFlowId / consumerFlow[]')
    .option('--json', '使用 JSON 输出')
    .option('--schema-version', '仅输出 public JSON schema 版本')
    .option('--consumer-profile <id>', '仅返回指定 commandCatalog.consumerProfiles 条目')
    .option('--action <action>', '仅返回指定 commandCatalog.actions 条目')
    .option('--recommended-action <code>', '仅返回指定 commandCatalog.recommendedActions 条目')
    .option('--catalog-summary', '仅返回轻量 catalogSummary 索引')
    .action(async (options: { json?: boolean; schemaVersion?: boolean; consumerProfile?: string; action?: string; recommendedAction?: string; catalogSummary?: boolean }) => {
      const service = new SchemaService()
      outputCommandResult(
        options.schemaVersion ? service.getPublicJsonSchemaVersion() : service.getPublicJsonSchema({
          consumerProfile: options.consumerProfile,
          action: options.action,
          recommendedAction: options.recommendedAction,
          catalogSummary: options.catalogSummary,
        }),
        options.json,
      )
    })
}
