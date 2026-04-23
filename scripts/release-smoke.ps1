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

function Test-IsObjectLike {
  param(
    [Parameter(Mandatory = $true)]
    [AllowNull()]
    [object]$Value
  )

  return ($null -ne $Value -and $Value -isnot [string] -and $Value -isnot [System.Array] -and @($Value.PSObject.Properties).Count -gt 0)
}

function Get-ObjectPropertyNames {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value
  )

  if ($Value -is [System.Collections.IDictionary]) {
    return @($Value.Keys)
  }

  return @($Value.PSObject.Properties | ForEach-Object { $_.Name })
}

function Test-ObjectHasProperty {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Value -is [System.Collections.IDictionary]) {
    return $Value.Contains($Name)
  }

  return $null -ne $Value.PSObject.Properties[$Name]
}

function Get-ObjectPropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Value -is [System.Collections.IDictionary]) {
    return $Value[$Name]
  }

  return $Value.PSObject.Properties[$Name].Value
}

function Get-PublicSchema {
  $cachedSchemaVariable = Get-Variable -Name CachedPublicSchema -Scope Script -ErrorAction SilentlyContinue
  if ($null -ne $cachedSchemaVariable -and $null -ne $cachedSchemaVariable.Value) {
    return $cachedSchemaVariable.Value
  }

  $schemaPath = Join-Path -Path $repoRoot -ChildPath 'docs/public-json-output.schema.json'
  $normalizedSchemaJson = node -e "const fs=require('fs'); const path=process.argv[1]; process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(path,'utf8'))));" $schemaPath
  $script:CachedPublicSchema = $normalizedSchemaJson | ConvertFrom-Json
  return $script:CachedPublicSchema
}

function Resolve-SchemaRef {
  param(
    [Parameter(Mandatory = $true)]
    [object]$RootSchema,
    [Parameter(Mandatory = $true)]
    [string]$Ref
  )

  if (-not $Ref.StartsWith('#/')) {
    throw "unsupported schema ref: $Ref"
  }

  $cursor = $RootSchema
  foreach ($part in $Ref.Substring(2).Split('/')) {
    if (-not (Test-IsObjectLike $cursor) -or -not (Test-ObjectHasProperty -Value $cursor -Name $part)) {
      throw "invalid schema ref path: $Ref"
    }
    $cursor = Get-ObjectPropertyValue -Value $cursor -Name $part
  }

  return $cursor
}

function Test-SchemaTypeMatch {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SchemaType,
    [AllowNull()]
    [object]$Value
  )

  switch ($SchemaType) {
    'object' { return Test-IsObjectLike $Value }
    'array' { return $Value -is [System.Array] }
    'string' { return $Value -is [string] }
    'boolean' { return $Value -is [bool] }
    'integer' { return ($Value -is [sbyte] -or $Value -is [byte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64]) }
    'number' { return ($Value -is [ValueType] -and $Value -isnot [bool] -and $Value -isnot [char]) }
    'null' { return $null -eq $Value }
    default { return $true }
  }
}

function Validate-SchemaNode {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Schema,
    [AllowNull()]
    [object]$Value,
    [Parameter(Mandatory = $true)]
    [object]$RootSchema
  )

  if (Test-ObjectHasProperty -Value $Schema -Name '$ref') {
    $resolvedSchema = Resolve-SchemaRef -RootSchema $RootSchema -Ref (Get-ObjectPropertyValue -Value $Schema -Name '$ref')
    return Validate-SchemaNode -Schema $resolvedSchema -Value $Value -RootSchema $RootSchema
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'allOf') {
    foreach ($branch in @(Get-ObjectPropertyValue -Value $Schema -Name 'allOf')) {
      if (-not (Validate-SchemaNode -Schema $branch -Value $Value -RootSchema $RootSchema)) {
        return $false
      }
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'oneOf') {
    $matchCount = 0
    foreach ($branch in @(Get-ObjectPropertyValue -Value $Schema -Name 'oneOf')) {
      if (Validate-SchemaNode -Schema $branch -Value $Value -RootSchema $RootSchema) {
        $matchCount++
      }
    }
    if ($matchCount -ne 1) {
      return $false
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'anyOf') {
    $matched = $false
    foreach ($branch in @(Get-ObjectPropertyValue -Value $Schema -Name 'anyOf')) {
      if (Validate-SchemaNode -Schema $branch -Value $Value -RootSchema $RootSchema) {
        $matched = $true
        break
      }
    }
    if (-not $matched) {
      return $false
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'if') {
    $conditionMatched = Validate-SchemaNode -Schema (Get-ObjectPropertyValue -Value $Schema -Name 'if') -Value $Value -RootSchema $RootSchema
    if ($conditionMatched -and (Test-ObjectHasProperty -Value $Schema -Name 'then')) {
      if (-not (Validate-SchemaNode -Schema (Get-ObjectPropertyValue -Value $Schema -Name 'then') -Value $Value -RootSchema $RootSchema)) {
        return $false
      }
    }
    if (-not $conditionMatched -and (Test-ObjectHasProperty -Value $Schema -Name 'else')) {
      if (-not (Validate-SchemaNode -Schema (Get-ObjectPropertyValue -Value $Schema -Name 'else') -Value $Value -RootSchema $RootSchema)) {
        return $false
      }
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'const') {
    $constValue = Get-ObjectPropertyValue -Value $Schema -Name 'const'
    if ($Value -ne $constValue) {
      return $false
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'enum') {
    $allowedValues = @(Get-ObjectPropertyValue -Value $Schema -Name 'enum')
    if (-not ($allowedValues -contains $Value)) {
      return $false
    }
  }

  if (Test-ObjectHasProperty -Value $Schema -Name 'type') {
    $schemaTypeNode = Get-ObjectPropertyValue -Value $Schema -Name 'type'
    $schemaTypes = if ($schemaTypeNode -is [System.Array]) { @($schemaTypeNode) } else { @($schemaTypeNode) }
    $typeMatched = $false
    foreach ($schemaType in $schemaTypes) {
      if (Test-SchemaTypeMatch -SchemaType $schemaType -Value $Value) {
        $typeMatched = $true
        break
      }
    }
    if (-not $typeMatched) {
      return $false
    }
  }

  if ((Test-ObjectHasProperty -Value $Schema -Name 'minimum') -and ($Value -isnot [string]) -and ($Value -lt (Get-ObjectPropertyValue -Value $Schema -Name 'minimum'))) {
    return $false
  }

  if (Test-IsObjectLike $Value) {
    if (Test-ObjectHasProperty -Value $Schema -Name 'required') {
      foreach ($requiredKey in @(Get-ObjectPropertyValue -Value $Schema -Name 'required')) {
        if (-not (Test-ObjectHasProperty -Value $Value -Name $requiredKey)) {
          return $false
        }
      }
    }

    if (Test-ObjectHasProperty -Value $Schema -Name 'properties') {
      $properties = Get-ObjectPropertyValue -Value $Schema -Name 'properties'
      foreach ($propertyName in Get-ObjectPropertyNames -Value $properties) {
        if (-not (Test-ObjectHasProperty -Value $Value -Name $propertyName)) {
          continue
        }

        $childSchema = Get-ObjectPropertyValue -Value $properties -Name $propertyName
        if (-not (Validate-SchemaNode -Schema $childSchema -Value (Get-ObjectPropertyValue -Value $Value -Name $propertyName) -RootSchema $RootSchema)) {
          return $false
        }
      }

      if ((Test-ObjectHasProperty -Value $Schema -Name 'additionalProperties') -and ((Get-ObjectPropertyValue -Value $Schema -Name 'additionalProperties') -eq $false)) {
        $allowedProperties = @(Get-ObjectPropertyNames -Value $properties)
        foreach ($propertyName in Get-ObjectPropertyNames -Value $Value) {
          if ($allowedProperties -notcontains $propertyName) {
            return $false
          }
        }
      }
    }
  }

  if (($Value -is [System.Array]) -and (Test-ObjectHasProperty -Value $Schema -Name 'items')) {
    $itemSchema = Get-ObjectPropertyValue -Value $Schema -Name 'items'
    foreach ($item in $Value) {
      if (-not (Validate-SchemaNode -Schema $itemSchema -Value $item -RootSchema $RootSchema)) {
        return $false
      }
    }
  }

  return $true
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
Invoke-Step -Name 'schema json' -Action {
  $payload = node dist/src/cli/index.js schema --json | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --json returned no payload'
  }
  $consumerProfiles = $payload.data.commandCatalog.consumerProfiles
  if ($null -eq $consumerProfiles) {
    throw 'schema --json returned no commandCatalog.consumerProfiles'
  }

  $readonlyStateAudit = $consumerProfiles | Where-Object { $_.id -eq 'readonly-state-audit' } | Select-Object -First 1
  $readonlyImportBatch = $consumerProfiles | Where-Object { $_.id -eq 'readonly-import-batch' } | Select-Object -First 1
  $singlePlatformWrite = $consumerProfiles | Where-Object { $_.id -eq 'single-platform-write' } | Select-Object -First 1

  if ($null -eq $readonlyStateAudit -or $readonlyStateAudit.bestEntryAction -ne 'current') {
    throw 'schema --json missing readonly-state-audit bestEntryAction=current'
  }
  if ($null -eq $readonlyImportBatch -or $readonlyImportBatch.bestEntryAction -ne 'import') {
    throw 'schema --json missing readonly-import-batch bestEntryAction=import'
  }
  if ($null -eq $singlePlatformWrite -or $singlePlatformWrite.bestEntryAction -ne 'preview') {
    throw 'schema --json missing single-platform-write bestEntryAction=preview'
  }
  if ($readonlyStateAudit.defaultConsumerFlowId -ne 'overview-to-items') {
    throw 'schema --json missing readonly-state-audit defaultConsumerFlowId=overview-to-items'
  }
  if ($null -eq ($readonlyStateAudit.consumerFlow | Where-Object { $_.id -eq 'overview-to-items' } | Select-Object -First 1)) {
    throw 'schema --json missing readonly-state-audit consumerFlow overview-to-items'
  }
  if ($readonlyImportBatch.defaultConsumerFlowId -ne 'source-to-repair') {
    throw 'schema --json missing readonly-import-batch defaultConsumerFlowId=source-to-repair'
  }
  if ($null -eq ($readonlyImportBatch.consumerFlow | Where-Object { $_.id -eq 'source-to-repair' } | Select-Object -First 1)) {
    throw 'schema --json missing readonly-import-batch consumerFlow source-to-repair'
  }
}
Invoke-Step -Name 'schema consumer profile filter json' -Action {
  $payload = node dist/src/cli/index.js schema --json --consumer-profile readonly-import-batch | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --json --consumer-profile returned no payload'
  }
  if (-not $payload.ok -or $payload.action -ne 'schema') {
    throw "unexpected schema --json --consumer-profile envelope: $($payload | ConvertTo-Json -Depth 20)"
  }

  $consumerProfiles = @($payload.data.commandCatalog.consumerProfiles)
  if ($consumerProfiles.Count -ne 1) {
    throw 'schema --json --consumer-profile returned more than one profile'
  }
  if ($consumerProfiles[0].id -ne 'readonly-import-batch') {
    throw "schema --json --consumer-profile returned unexpected profile: $($consumerProfiles[0].id)"
  }
  if (@($payload.data.commandCatalog.actions).Count -le 1) {
    throw 'schema --json --consumer-profile unexpectedly trimmed commandCatalog.actions'
  }
  if ($null -eq $payload.data.schema) {
    throw 'schema --json --consumer-profile unexpectedly trimmed schema'
  }
}
Invoke-Step -Name 'schema consumer profile filter failure json' -Action {
  $publicSchema = Get-PublicSchema
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath 'node' -ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--consumer-profile', 'missing-profile') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $renderedStdout = Get-Content -LiteralPath $stdoutPath -Raw
  $renderedStderr = Get-Content -LiteralPath $stderrPath -Raw
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force

  if ($process.ExitCode -ne 1) {
    throw "unexpected exit code for schema consumer profile failure: $($process.ExitCode)"
  }
  if (-not [string]::IsNullOrWhiteSpace($renderedStderr)) {
    throw "unexpected stderr for schema consumer profile failure: $renderedStderr"
  }

  $payload = $renderedStdout | ConvertFrom-Json
  if ($payload.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected top-level schemaVersion for schema consumer profile failure: $($payload.schemaVersion)"
  }
  if ($payload.ok -ne $false -or $payload.action -ne 'schema') {
    throw "unexpected schema consumer profile failure envelope: $($payload | ConvertTo-Json -Depth 20)"
  }
  if ($null -eq $payload.error -or $payload.error.code -ne 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND') {
    throw "unexpected error code for schema consumer profile failure: $($payload.error.code)"
  }
  if ($payload.error.details.consumerProfileId -ne 'missing-profile') {
    throw "unexpected consumerProfileId for schema consumer profile failure: $($payload.error.details.consumerProfileId)"
  }
  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema)) {
    throw "schema consumer profile failure payload failed public schema validation"
  }
}
Invoke-Step -Name 'schema action filter json' -Action {
  $payload = node dist/src/cli/index.js schema --json --action import-apply | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --json --action returned no payload'
  }
  if (-not $payload.ok -or $payload.action -ne 'schema') {
    throw "unexpected schema --json --action envelope: $($payload | ConvertTo-Json -Depth 20)"
  }

  $actions = @($payload.data.commandCatalog.actions)
  if ($actions.Count -ne 1) {
    throw 'schema --json --action returned more than one action'
  }
  if ($actions[0].action -ne 'import-apply') {
    throw "schema --json --action returned unexpected action: $($actions[0].action)"
  }
  if (@($payload.data.commandCatalog.consumerProfiles).Count -le 1) {
    throw 'schema --json --action unexpectedly trimmed commandCatalog.consumerProfiles'
  }
  if ($null -eq $payload.data.schema) {
    throw 'schema --json --action unexpectedly trimmed schema'
  }
}
Invoke-Step -Name 'schema action filter failure json' -Action {
  $publicSchema = Get-PublicSchema
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath 'node' -ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--action', 'missing-action') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $renderedStdout = Get-Content -LiteralPath $stdoutPath -Raw
  $renderedStderr = Get-Content -LiteralPath $stderrPath -Raw
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force

  if ($process.ExitCode -ne 1) {
    throw "unexpected exit code for schema action failure: $($process.ExitCode)"
  }
  if (-not [string]::IsNullOrWhiteSpace($renderedStderr)) {
    throw "unexpected stderr for schema action failure: $renderedStderr"
  }

  $payload = $renderedStdout | ConvertFrom-Json
  if ($payload.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected top-level schemaVersion for schema action failure: $($payload.schemaVersion)"
  }
  if ($payload.ok -ne $false -or $payload.action -ne 'schema') {
    throw "unexpected schema action failure envelope: $($payload | ConvertTo-Json -Depth 20)"
  }
  if ($null -eq $payload.error -or $payload.error.code -ne 'SCHEMA_ACTION_NOT_FOUND') {
    throw "unexpected error code for schema action failure: $($payload.error.code)"
  }
  if ($payload.error.details.action -ne 'missing-action') {
    throw "unexpected action for schema action failure: $($payload.error.details.action)"
  }
  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema)) {
    throw "schema action failure payload failed public schema validation"
  }
}
Invoke-Step -Name 'schema recommended action filter json' -Action {
  $payload = node dist/src/cli/index.js schema --json --recommended-action continue-to-write | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --json --recommended-action returned no payload'
  }
  if (-not $payload.ok -or $payload.action -ne 'schema') {
    throw "unexpected schema --json --recommended-action envelope: $($payload | ConvertTo-Json -Depth 20)"
  }

  $recommendedActions = @($payload.data.commandCatalog.recommendedActions)
  if ($recommendedActions.Count -ne 1) {
    throw 'schema --json --recommended-action returned more than one recommended action'
  }
  if ($recommendedActions[0].code -ne 'continue-to-write') {
    throw "schema --json --recommended-action returned unexpected code: $($recommendedActions[0].code)"
  }
  if (@($payload.data.commandCatalog.actions).Count -le 1) {
    throw 'schema --json --recommended-action unexpectedly trimmed commandCatalog.actions'
  }
  if (@($payload.data.commandCatalog.consumerProfiles).Count -le 1) {
    throw 'schema --json --recommended-action unexpectedly trimmed commandCatalog.consumerProfiles'
  }
  if ($null -eq $payload.data.schema) {
    throw 'schema --json --recommended-action unexpectedly trimmed schema'
  }
}
Invoke-Step -Name 'schema recommended action filter failure json' -Action {
  $publicSchema = Get-PublicSchema
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath 'node' -ArgumentList @('dist/src/cli/index.js', 'schema', '--json', '--recommended-action', 'missing-step') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $renderedStdout = Get-Content -LiteralPath $stdoutPath -Raw
  $renderedStderr = Get-Content -LiteralPath $stderrPath -Raw
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force

  if ($process.ExitCode -ne 1) {
    throw "unexpected exit code for schema recommended action failure: $($process.ExitCode)"
  }
  if (-not [string]::IsNullOrWhiteSpace($renderedStderr)) {
    throw "unexpected stderr for schema recommended action failure: $renderedStderr"
  }

  $payload = $renderedStdout | ConvertFrom-Json
  if ($payload.schemaVersion -ne $publicJsonSchemaVersion) {
    throw "unexpected top-level schemaVersion for schema recommended action failure: $($payload.schemaVersion)"
  }
  if ($payload.ok -ne $false -or $payload.action -ne 'schema') {
    throw "unexpected schema recommended action failure envelope: $($payload | ConvertTo-Json -Depth 20)"
  }
  if ($null -eq $payload.error -or $payload.error.code -ne 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND') {
    throw "unexpected error code for schema recommended action failure: $($payload.error.code)"
  }
  if ($payload.error.details.code -ne 'missing-step') {
    throw "unexpected code for schema recommended action failure: $($payload.error.details.code)"
  }
  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema)) {
    throw "schema recommended action failure payload failed public schema validation"
  }
}
Invoke-Step -Name 'schema catalog summary json' -Action {
  $publicSchema = Get-PublicSchema
  $payload = node dist/src/cli/index.js schema --json --catalog-summary | ConvertFrom-Json
  if ($null -eq $payload) {
    throw 'schema --json --catalog-summary returned no payload'
  }
  if (-not $payload.ok -or $payload.action -ne 'schema') {
    throw "unexpected schema --json --catalog-summary envelope: $($payload | ConvertTo-Json -Depth 20)"
  }
  if ($payload.data.catalogSummary.counts.consumerProfiles -ne 3) {
    throw 'schema --json --catalog-summary returned unexpected catalogSummary.counts.consumerProfiles'
  }
  if ($payload.data.catalogSummary.counts.actions -ne 11) {
    throw 'schema --json --catalog-summary returned unexpected catalogSummary.counts.actions'
  }
  if ($payload.data.catalogSummary.counts.recommendedActions -ne 15) {
    throw 'schema --json --catalog-summary returned unexpected catalogSummary.counts.recommendedActions'
  }
  $dataPropertyNames = @($payload.data.PSObject.Properties.Name)
  if ($dataPropertyNames -contains 'commandCatalog') {
    throw 'schema --json --catalog-summary unexpectedly returned commandCatalog'
  }
  if ($dataPropertyNames -contains 'schemaId') {
    throw 'schema --json --catalog-summary unexpectedly returned schemaId'
  }
  if ($dataPropertyNames -contains 'schema') {
    throw 'schema --json --catalog-summary unexpectedly returned schema'
  }
  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema)) {
    throw 'schema catalog summary payload failed public schema validation'
  }
}
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
Invoke-Step -Name 'public schema validation smoke' -Action {
  $publicSchema = Get-PublicSchema
  $schemaVersionPayload = node dist/src/cli/index.js schema --schema-version --json | ConvertFrom-Json

  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $schemaVersionPayload -RootSchema $publicSchema)) {
    throw "schemaVersion payload failed public schema validation"
  }
}
Invoke-Step -Name 'public schema catalog summary discoverability' -Action {
  $publicSchema = Get-PublicSchema
  $schemaDefs = Get-ObjectPropertyValue -Value $publicSchema -Name '$defs'
  $schemaCatalogSummary = Get-ObjectPropertyValue -Value $schemaDefs -Name 'SchemaCatalogSummary'

  if ($null -eq $schemaCatalogSummary) {
    throw 'public schema missing SchemaCatalogSummary'
  }
  if ([string]::IsNullOrWhiteSpace($schemaCatalogSummary.description)) {
    throw 'SchemaCatalogSummary missing description for catalog-summary discoverability'
  }
  if ($schemaCatalogSummary.description -notmatch 'consumerProfiles / actions / recommendedActions') {
    throw 'SchemaCatalogSummary description lost catalogSummary summary fields'
  }

  $examples = @($schemaCatalogSummary.examples)
  if ($examples.Count -lt 1) {
    throw 'SchemaCatalogSummary missing examples for catalog-summary discoverability'
  }

  $firstExample = $examples[0]
  if ($firstExample.counts.consumerProfiles -ne 3) {
    throw 'SchemaCatalogSummary example lost consumerProfiles count'
  }
  if ($firstExample.counts.actions -ne 11) {
    throw 'SchemaCatalogSummary example lost actions count'
  }
  if ($firstExample.counts.recommendedActions -ne 15) {
    throw 'SchemaCatalogSummary example lost recommendedActions count'
  }
  if ($null -eq ($firstExample.consumerProfiles | Where-Object { $_.id -eq 'readonly-state-audit' -and $_.bestEntryAction -eq 'current' } | Select-Object -First 1)) {
    throw 'SchemaCatalogSummary example lost readonly-state-audit consumer profile'
  }
  if ($null -eq ($firstExample.recommendedActions | Where-Object { $_.code -eq 'continue-to-write' -and $_.family -eq 'execute' } | Select-Object -First 1)) {
    throw 'SchemaCatalogSummary example lost continue-to-write recommended action'
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
  $publicSchema = Get-PublicSchema
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
  if (-not (Validate-SchemaNode -Schema $publicSchema -Value $payload -RootSchema $publicSchema)) {
    throw "import missing file payload failed public schema validation"
  }
}

Write-Host 'Release smoke checks passed.'
