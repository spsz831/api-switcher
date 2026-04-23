import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'

describe('package metadata', () => {
  it('points the CLI bin to the built entrypoint', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      bin?: Record<string, string>
    }

    expect(packageJson.bin?.['api-switcher']).toBe('dist/src/cli/index.js')
  })

  it('exposes a release smoke script wired to a checked-in PowerShell runner', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
    }
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')

    expect(packageJson.scripts?.['smoke:release']).toBe('powershell -ExecutionPolicy Bypass -File ./scripts/release-smoke.ps1')
    expect(fs.existsSync(smokeScriptPath)).toBe(true)
  })

  it('release smoke script verifies dist schema version json contract', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema version json'")
    expect(smokeScript).toContain('node dist/src/cli/index.js schema --schema-version --json | ConvertFrom-Json')
    expect(smokeScript).toContain(`$publicJsonSchemaVersion = '${PUBLIC_JSON_SCHEMA_VERSION}'`)
    expect(smokeScript).toContain("$payload.action -ne 'schema'")
    expect(smokeScript).toContain('$payload.data.schemaVersion -ne $publicJsonSchemaVersion')
  })

  it('release smoke script verifies schema consumerProfiles entry hints', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema json'")
    expect(smokeScript).toContain("commandCatalog.consumerProfiles")
    expect(smokeScript).toContain("readonly-state-audit")
    expect(smokeScript).toContain("readonly-import-batch")
    expect(smokeScript).toContain("single-platform-write")
    expect(smokeScript).toContain("bestEntryAction -ne 'current'")
    expect(smokeScript).toContain("bestEntryAction -ne 'import'")
    expect(smokeScript).toContain("bestEntryAction -ne 'preview'")
    expect(smokeScript).toContain("defaultConsumerFlowId -ne 'overview-to-items'")
    expect(smokeScript).toContain("consumerFlow overview-to-items")
    expect(smokeScript).toContain("defaultConsumerFlowId -ne 'source-to-repair'")
    expect(smokeScript).toContain("consumerFlow source-to-repair")
  })

  it('release smoke script verifies schema starter recipes discoverability', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain('starterRecipes')
    expect(smokeScript).toContain("readonly-state-audit-overview")
    expect(smokeScript).toContain("single-platform-write-preview-to-execute")
    expect(smokeScript).toContain("readonly-import-batch-source-gating")
    expect(smokeScript).toContain("api-switcher schema --json --catalog-summary")
    expect(smokeScript).toContain("api-switcher schema --json --action preview")
    expect(smokeScript).toContain("api-switcher schema --json --recommended-action continue-to-write")
    expect(smokeScript).toContain("api-switcher import preview <file> --json")
    expect(smokeScript).toContain('schema --json missing readonly-state-audit starter recipe')
    expect(smokeScript).toContain('schema --json missing single-platform-write starter recipe')
    expect(smokeScript).toContain('schema --json missing readonly-import-batch starter recipe')
  })

  it('release smoke script verifies schema starter templates discoverability', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain('starterTemplate')
    expect(smokeScript).toContain('readonly-state-audit-minimal-reader')
    expect(smokeScript).toContain('readonly-import-batch-minimal-reader')
    expect(smokeScript).toContain('summary.platformStats')
    expect(smokeScript).toContain('summary.sourceExecutability')
    expect(smokeScript).toContain('error.code')
    expect(smokeScript).toContain('schema --json missing readonly-state-audit starter template')
    expect(smokeScript).toContain('schema --json missing readonly-import-batch starter template')
  })

  it('release smoke script verifies readonly consumer flow linkage to actions and recommended actions', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain('consumerActions')
    expect(smokeScript).toContain('consumerActionId')
    expect(smokeScript).toContain('overview-to-items')
    expect(smokeScript).toContain('source-to-repair')
    expect(smokeScript).toContain('inspect-overview')
    expect(smokeScript).toContain('repair-source-blockers')
    expect(smokeScript).toContain('inspect-items')
    expect(smokeScript).toContain('repair-source-input')
    expect(smokeScript).toContain('schema --json missing readonly-state-audit default flow linkage')
    expect(smokeScript).toContain('schema --json missing readonly-import-batch default flow linkage')
  })

  it('release smoke script verifies schema consumer profile filtering contract', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema consumer profile filter json'")
    expect(smokeScript).toContain('node dist/src/cli/index.js schema --json --consumer-profile readonly-import-batch')
    expect(smokeScript).toContain('schema --json --consumer-profile returned more than one profile')
    expect(smokeScript).toContain('schema --json --consumer-profile unexpectedly trimmed commandCatalog.actions')
    expect(smokeScript).toContain('schema --json --consumer-profile unexpectedly trimmed schema')
    expect(smokeScript).toContain("Invoke-Step -Name 'schema consumer profile filter failure json'")
    expect(smokeScript).toContain("-ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--consumer-profile', 'missing-profile')")
    expect(smokeScript).toContain('SCHEMA_CONSUMER_PROFILE_NOT_FOUND')
    expect(smokeScript).toContain('schema consumer profile failure payload failed public schema validation')
  })

  it('release smoke script verifies schema action filtering contract', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema action filter json'")
    expect(smokeScript).toContain('node dist/src/cli/index.js schema --json --action import-apply')
    expect(smokeScript).toContain('schema --json --action returned more than one action')
    expect(smokeScript).toContain('schema --json --action unexpectedly trimmed commandCatalog.consumerProfiles')
    expect(smokeScript).toContain('schema --json --action unexpectedly trimmed schema')
    expect(smokeScript).toContain("Invoke-Step -Name 'schema action filter failure json'")
    expect(smokeScript).toContain("-ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--action', 'missing-action')")
    expect(smokeScript).toContain('SCHEMA_ACTION_NOT_FOUND')
    expect(smokeScript).toContain('schema action failure payload failed public schema validation')
  })

  it('release smoke script verifies schema recommended action filtering contract', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema recommended action filter json'")
    expect(smokeScript).toContain('node dist/src/cli/index.js schema --json --recommended-action continue-to-write')
    expect(smokeScript).toContain('schema --json --recommended-action returned more than one recommended action')
    expect(smokeScript).toContain('schema --json --recommended-action unexpectedly trimmed commandCatalog.actions')
    expect(smokeScript).toContain('schema --json --recommended-action unexpectedly trimmed commandCatalog.consumerProfiles')
    expect(smokeScript).toContain('schema --json --recommended-action unexpectedly trimmed schema')
    expect(smokeScript).toContain("Invoke-Step -Name 'schema recommended action filter failure json'")
    expect(smokeScript).toContain("-ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--recommended-action', 'missing-step')")
    expect(smokeScript).toContain('SCHEMA_RECOMMENDED_ACTION_NOT_FOUND')
    expect(smokeScript).toContain('schema recommended action failure payload failed public schema validation')
  })

  it('release smoke script verifies schema catalog summary contract', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'schema catalog summary json'")
    expect(smokeScript).toContain('node dist/src/cli/index.js schema --json --catalog-summary')
    expect(smokeScript).toContain('catalogSummary.counts.consumerProfiles -ne 3')
    expect(smokeScript).toContain('catalogSummary.counts.actions -ne 11')
    expect(smokeScript).toContain('catalogSummary.counts.recommendedActions -ne 15')
    expect(smokeScript).toContain('schema --json --catalog-summary unexpectedly returned commandCatalog')
    expect(smokeScript).toContain('schema --json --catalog-summary unexpectedly returned schemaId')
    expect(smokeScript).toContain('schema --json --catalog-summary unexpectedly returned schema')
    expect(smokeScript).toContain('schema catalog summary payload failed public schema validation')
  })

  it('release smoke script verifies schema catalog summary entry mode discoverability', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain('recommendedEntryMode')
    expect(smokeScript).toContain('starterTemplateId')
    expect(smokeScript).toContain('readonly-state-audit')
    expect(smokeScript).toContain('single-platform-write')
    expect(smokeScript).toContain('readonly-import-batch')
    expect(smokeScript).toContain('readonly-state-audit-minimal-reader')
    expect(smokeScript).toContain('readonly-import-batch-minimal-reader')
    expect(smokeScript).toContain('schema --json --catalog-summary missing readonly-state-audit entry mode')
    expect(smokeScript).toContain('schema --json --catalog-summary missing single-platform-write entry mode')
    expect(smokeScript).toContain('schema --json --catalog-summary missing readonly-import-batch entry mode')
  })

  it('release smoke script verifies machine-readable schema catalog summary discoverability', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'public schema catalog summary discoverability'")
    expect(smokeScript).toContain("$schemaDefs = Get-ObjectPropertyValue -Value $publicSchema -Name '$defs'")
    expect(smokeScript).toContain("$schemaCatalogSummary = Get-ObjectPropertyValue -Value $schemaDefs -Name 'SchemaCatalogSummary'")
    expect(smokeScript).toContain("SchemaCatalogSummary missing description for catalog-summary discoverability")
    expect(smokeScript).toContain("SchemaCatalogSummary description lost catalogSummary summary fields")
    expect(smokeScript).toContain("SchemaCatalogSummary missing examples for catalog-summary discoverability")
    expect(smokeScript).toContain("SchemaCatalogSummary example lost consumerProfiles count")
    expect(smokeScript).toContain("SchemaCatalogSummary example lost continue-to-write recommended action")
  })

  it('release smoke script verifies current/list json platformSummary contracts', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'current list json platform summaries'")
    expect(smokeScript).toContain("node dist/src/cli/index.js current --json | ConvertFrom-Json")
    expect(smokeScript).toContain("node dist/src/cli/index.js list --json | ConvertFrom-Json")
    expect(smokeScript).toContain("GEMINI_SCOPE_PRECEDENCE")
    expect(smokeScript).toContain("CODEX_MULTI_FILE_CONFIGURATION")
    expect(smokeScript).toContain("scope-precedence")
    expect(smokeScript).toContain("multi-file-composition")
  })

  it('release smoke script verifies dist cli help keeps the top-level command surface discoverable', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'cli help'")
    expect(smokeScript).toContain('node dist/src/cli/index.js --help | Out-String')
    expect(smokeScript).toContain("$helpOutput -notmatch 'Usage:'")
    expect(smokeScript).toContain("@('preview', 'use', 'rollback', 'current', 'list', 'validate', 'export', 'add', 'schema', 'import')")
    expect(smokeScript).toContain('cli help missing command')
  })

  it('release smoke script verifies a stable dist failure path', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'unknown command failure'")
    expect(smokeScript).toContain("Start-Process -FilePath 'node'")
    expect(smokeScript).toContain("-ArgumentList @('dist/src/cli/index.js', 'unknown-command')")
    expect(smokeScript).toContain('-RedirectStandardError $stderrPath')
    expect(smokeScript).toContain('$process.ExitCode -ne 1')
    expect(smokeScript).toContain(`"unknown command 'unknown-command'"`)
    expect(smokeScript).toContain('Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force')
  })

  it('release smoke script verifies a stable dist json failure envelope', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'json failure envelope'")
    expect(smokeScript).toContain("Start-Process -FilePath 'node'")
    expect(smokeScript).toContain("-ArgumentList @('dist/src/cli/index.js', 'import', $missingImportFile, '--json')")
    expect(smokeScript).toContain('$process.ExitCode -ne 1')
    expect(smokeScript).toContain('[string]::IsNullOrWhiteSpace($renderedStderr)')
    expect(smokeScript).toContain('$payload = $renderedStdout | ConvertFrom-Json')
    expect(smokeScript).toContain("unexpected top-level schemaVersion for import failure")
    expect(smokeScript).toContain("$payload.action -ne 'import'")
    expect(smokeScript).toContain("IMPORT_SOURCE_NOT_FOUND")
    expect(smokeScript).toContain("import missing file payload failed public schema validation")
    expect(smokeScript).toContain("Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema")
  })

  it('release smoke script includes a minimal public schema validation smoke for dist json output', () => {
    const smokeScriptPath = path.resolve(__dirname, '../../scripts/release-smoke.ps1')
    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8')

    expect(smokeScript).toContain("Invoke-Step -Name 'public schema validation smoke'")
    expect(smokeScript).toContain("docs/public-json-output.schema.json")
    expect(smokeScript).toContain("schema --schema-version --json")
    expect(smokeScript).toContain("schemaVersion payload failed public schema validation")
    expect(smokeScript).toContain("function Validate-SchemaNode")
  })
})
