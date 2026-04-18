$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$publicJsonSchemaVersion = '2026-04-15.public-json.v1'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host "==> $Name"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Name"
  }
}

Invoke-Step -Name 'typecheck' -Action { corepack pnpm typecheck }
Invoke-Step -Name 'build' -Action { corepack pnpm build }
Invoke-Step -Name 'test' -Action { corepack pnpm test }
Invoke-Step -Name 'cli help' -Action { node dist/src/cli/index.js --help | Out-Null }
Invoke-Step -Name 'schema json' -Action { node dist/src/cli/index.js schema --json | Out-Null }
Invoke-Step -Name 'schema version json' -Action {
  $payload = node dist/src/cli/index.js schema --schema-version --json | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --schema-version --json returned no payload'
  }
  if ($payload.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected top-level schemaVersion: $($payload.schemaVersion)"
  }
  if (-not $payload.ok) {
    throw 'schema --schema-version --json returned ok=false'
  }
  if ($payload.action -ne 'schema') {
    throw "unexpected action: $($payload.action)"
  }
  if ($null -eq $payload.data -or $payload.data.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected data.schemaVersion: $($payload.data.schemaVersion)"
  }
}

Write-Host 'Release smoke checks passed.'
