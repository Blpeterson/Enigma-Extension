[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distPath = Join-Path $projectRoot "dist"
$manifestPath = Join-Path $distPath "manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "dist/manifest.json was not found. Run npm run build first."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if (-not $version) {
  throw "The built manifest has no version."
}

$packageDirectory = Join-Path $projectRoot "artifacts\package"
[System.IO.Directory]::CreateDirectory($packageDirectory) | Out-Null
$packagePath = Join-Path $packageDirectory "drive-vault-$version-chrome.zip"

Compress-Archive `
  -Path (Join-Path $distPath "*") `
  -DestinationPath $packagePath `
  -CompressionLevel Optimal `
  -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
  $manifestEntry = $archive.Entries | Where-Object { $_.FullName -eq "manifest.json" }
  if (-not $manifestEntry) {
    throw "The package is invalid: manifest.json is not at the ZIP root."
  }
}
finally {
  $archive.Dispose()
}

Write-Output "Created Chrome Web Store package: $packagePath"
