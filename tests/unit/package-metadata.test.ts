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
  })
})
