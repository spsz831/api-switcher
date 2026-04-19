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
Invoke-Step -Name 'cli help' -Action {
  $helpOutput = node dist/src/cli/index.js --help | Out-String
  if ($helpOutput -notmatch 'Usage:') {
    throw "cli help missing Usage banner: $helpOutput"
  }
  foreach ($expectedCommand in @('preview', 'use', 'rollback', 'current', 'list', 'validate', 'export', 'add', 'schema', 'import')) {
    if ($helpOutput -notmatch [regex]::Escape($expectedCommand)) {
      throw "cli help missing command: $expectedCommand"
    }
  }
}
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
Invoke-Step -Name 'current list json platform summaries' -Action {
  function Write-SmokeJson {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,
      [Parameter(Mandatory = $true)]
      [object]$Value
    )

    [System.IO.File]::WriteAllText(
      $Path,
      ($Value | ConvertTo-Json -Depth 20),
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  function Write-SmokeText {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,
      [Parameter(Mandatory = $true)]
      [string]$Value
    )

    [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
  }

  $smokeRoot = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "api-switcher-release-smoke-$([System.Guid]::NewGuid().ToString('N'))"
  $runtimeDir = Join-Path -Path $smokeRoot -ChildPath 'runtime'
  $geminiProjectRoot = Join-Path -Path $smokeRoot -ChildPath 'gemini-workspace'
  $geminiSettingsPath = Join-Path -Path $smokeRoot -ChildPath 'gemini-settings.json'
  $geminiProjectSettingsPath = Join-Path -Path $geminiProjectRoot -ChildPath '.gemini/settings.json'
  $codexConfigPath = Join-Path -Path $smokeRoot -ChildPath 'codex-config.toml'
  $codexAuthPath = Join-Path -Path $smokeRoot -ChildPath 'codex-auth.json'
  $claudeProjectRoot = Join-Path -Path $smokeRoot -ChildPath 'claude-workspace'
  $claudeProjectSettingsPath = Join-Path -Path $claudeProjectRoot -ChildPath '.claude/settings.json'
  $claudeLocalSettingsPath = Join-Path -Path $claudeProjectRoot -ChildPath '.claude/settings.local.json'
  $claudeUserSettingsPath = Join-Path -Path $smokeRoot -ChildPath 'claude-user-settings.json'

  try {
    New-Item -ItemType Directory -Force -Path $runtimeDir, (Split-Path -Parent $geminiProjectSettingsPath), (Split-Path -Parent $claudeProjectSettingsPath) | Out-Null

    $env:API_SWITCHER_RUNTIME_DIR = $runtimeDir
    $env:API_SWITCHER_GEMINI_SETTINGS_PATH = $geminiSettingsPath
    $env:API_SWITCHER_GEMINI_PROJECT_ROOT = $geminiProjectRoot
    $env:API_SWITCHER_CODEX_CONFIG_PATH = $codexConfigPath
    $env:API_SWITCHER_CODEX_AUTH_PATH = $codexAuthPath
    $env:API_SWITCHER_CLAUDE_PROJECT_ROOT = $claudeProjectRoot
    $env:API_SWITCHER_CLAUDE_USER_SETTINGS_PATH = $claudeUserSettingsPath
    $env:API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH = $claudeProjectSettingsPath
    $env:API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH = $claudeLocalSettingsPath
    $env:API_SWITCHER_CLAUDE_TARGET_SCOPE = 'project'

    $profiles = @{
      version = 1
      profiles = @(
        @{
          id = 'gemini-prod'
          name = 'gemini-prod'
          platform = 'gemini'
          source = @{
            apiKey = 'gm-live-123456'
            authType = 'gemini-api-key'
          }
          apply = @{
            GEMINI_API_KEY = 'gm-live-123456'
            enforcedAuthType = 'gemini-api-key'
          }
        },
        @{
          id = 'codex-prod'
          name = 'codex-prod'
          platform = 'codex'
          source = @{
            apiKey = 'sk-codex-live-123456'
            baseURL = 'https://gateway.example.com/openai/v1'
          }
          apply = @{
            OPENAI_API_KEY = 'sk-codex-live-123456'
            base_url = 'https://gateway.example.com/openai/v1'
          }
        },
        @{
          id = 'claude-prod'
          name = 'claude-prod'
          platform = 'claude'
          source = @{
            token = 'sk-live-123456'
            baseURL = 'https://gateway.example.com/api'
          }
          apply = @{
            ANTHROPIC_AUTH_TOKEN = 'sk-live-123456'
            ANTHROPIC_BASE_URL = 'https://gateway.example.com/api'
          }
        }
      )
    }
    Write-SmokeJson -Path (Join-Path -Path $runtimeDir -ChildPath 'profiles.json') -Value $profiles
    Write-SmokeJson -Path $geminiSettingsPath -Value @{ enforcedAuthType = 'gemini-api-key' }
    Write-SmokeJson -Path $geminiProjectSettingsPath -Value @{ projectOnly = $true }
    Write-SmokeText -Path $codexConfigPath -Value 'base_url = "https://gateway.example.com/openai/v1"'
    Write-SmokeJson -Path $codexAuthPath -Value @{ OPENAI_API_KEY = 'sk-codex-live-123456' }
    Write-SmokeJson -Path $claudeProjectSettingsPath -Value @{
      ANTHROPIC_AUTH_TOKEN = 'sk-live-123456'
      ANTHROPIC_BASE_URL = 'https://gateway.example.com/api'
    }

    $currentPayload = node dist/src/cli/index.js current --json | ConvertFrom-Json
    if ($currentPayload.schemaVersion -ne $publicJsonSchemaVersion -or -not $currentPayload.ok -or $currentPayload.action -ne 'current') {
      throw "unexpected current --json envelope: $($currentPayload | ConvertTo-Json -Depth 20)"
    }
    $geminiDetection = @($currentPayload.data.detections | Where-Object { $_.platform -eq 'gemini' })[0]
    if ($null -eq $geminiDetection -or $geminiDetection.platformSummary.kind -ne 'scope-precedence') {
      throw "current --json missing Gemini scope-precedence platformSummary"
    }
    if ((@($geminiDetection.platformSummary.facts | Where-Object { $_.code -eq 'GEMINI_SCOPE_PRECEDENCE' }).Count) -ne 1) {
      throw "current --json missing GEMINI_SCOPE_PRECEDENCE fact"
    }
    $codexDetection = @($currentPayload.data.detections | Where-Object { $_.platform -eq 'codex' })[0]
    if ($null -eq $codexDetection -or $codexDetection.platformSummary.kind -ne 'multi-file-composition') {
      throw "current --json missing Codex multi-file-composition platformSummary"
    }
    if ((@($codexDetection.platformSummary.facts | Where-Object { $_.code -eq 'CODEX_MULTI_FILE_CONFIGURATION' }).Count) -ne 1) {
      throw "current --json missing CODEX_MULTI_FILE_CONFIGURATION fact"
    }

    $listPayload = node dist/src/cli/index.js list --json | ConvertFrom-Json
    if ($listPayload.schemaVersion -ne $publicJsonSchemaVersion -or -not $listPayload.ok -or $listPayload.action -ne 'list') {
      throw "unexpected list --json envelope: $($listPayload | ConvertTo-Json -Depth 20)"
    }
    $geminiProfile = @($listPayload.data.profiles | Where-Object { $_.profile.id -eq 'gemini-prod' })[0]
    if ($null -eq $geminiProfile -or $geminiProfile.platformSummary.kind -ne 'scope-precedence') {
      throw "list --json missing Gemini scope-precedence platformSummary"
    }
    if ((@($geminiProfile.platformSummary.facts | Where-Object { $_.code -eq 'GEMINI_SCOPE_PRECEDENCE' }).Count) -ne 1) {
      throw "list --json missing GEMINI_SCOPE_PRECEDENCE fact"
    }
    $codexProfile = @($listPayload.data.profiles | Where-Object { $_.profile.id -eq 'codex-prod' })[0]
    if ($null -eq $codexProfile -or $codexProfile.platformSummary.kind -ne 'multi-file-composition') {
      throw "list --json missing Codex multi-file-composition platformSummary"
    }
    if ((@($codexProfile.platformSummary.facts | Where-Object { $_.code -eq 'CODEX_MULTI_FILE_CONFIGURATION' }).Count) -ne 1) {
      throw "list --json missing CODEX_MULTI_FILE_CONFIGURATION fact"
    }
  }
  finally {
    Remove-Item Env:\API_SWITCHER_RUNTIME_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_GEMINI_SETTINGS_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_GEMINI_PROJECT_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CODEX_CONFIG_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CODEX_AUTH_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CLAUDE_PROJECT_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CLAUDE_USER_SETTINGS_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\API_SWITCHER_CLAUDE_TARGET_SCOPE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $smokeRoot) {
      Remove-Item -LiteralPath $smokeRoot -Recurse -Force
    }
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
