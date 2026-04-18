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
Invoke-Step -Name 'unknown command failure' -Action {
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath 'node' -ArgumentList @('dist/src/cli/index.js', 'unknown-command') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $renderedOutput = Get-Content -LiteralPath $stderrPath -Raw
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force
  if ($process.ExitCode -ne 1) {
    throw "unexpected exit code for unknown command: $($process.ExitCode)"
  }
  if ($renderedOutput -notmatch "unknown command 'unknown-command'") {
    throw "unexpected stderr for unknown command: $renderedOutput"
  }
}
Invoke-Step -Name 'json failure envelope' -Action {
  $missingImportFile = Join-Path -Path $repoRoot -ChildPath 'missing-file.json'
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath 'node' -ArgumentList @('dist/src/cli/index.js', 'import', $missingImportFile, '--json') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $renderedStdout = Get-Content -LiteralPath $stdoutPath -Raw
  $renderedStderr = Get-Content -LiteralPath $stderrPath -Raw
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force
  if ($process.ExitCode -ne 1) {
    throw "unexpected exit code for import failure: $($process.ExitCode)"
  }
  if (-not [string]::IsNullOrWhiteSpace($renderedStderr)) {
    throw "unexpected stderr for import failure: $renderedStderr"
  }
  $payload = $renderedStdout | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'import missing file --json returned no payload'
  }
  if ($payload.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected top-level schemaVersion for import failure: $($payload.schemaVersion)"
  }
  if ($payload.ok -ne $false) {
    throw "unexpected ok for import failure: $($payload.ok)"
  }
  if ($payload.action -ne 'import') {
    throw "unexpected action for import failure: $($payload.action)"
  }
  if ($null -eq $payload.error -or $payload.error.code -ne 'IMPORT_SOURCE_NOT_FOUND') {
    throw "unexpected error code for import failure: $($payload.error.code)"
  }
}

Write-Host 'Release smoke checks passed.'
