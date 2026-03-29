#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Responsive guard - checks for forbidden raw grid/table patterns.
  Run in CI or pre-commit to enforce ResponsiveGrid / ResponsiveTableWrapper usage.
#>

$ErrorActionPreference = 'Continue'
$root = Join-Path $PSScriptRoot 'samplepos.client' 'src'
$exitCode = 0

# Patterns that should use wrapper components instead
$forbidden = @(
    @{ Pattern = '\bgrid-cols-[234]\b'; Allowed = 'ResponsiveGrid|ResponsiveFormGrid|sm:grid-cols|md:grid-cols|lg:grid-cols'; Message = 'Use <ResponsiveGrid cols={N}> or <ResponsiveFormGrid> instead of raw grid-cols-2/3/4' },
    @{ Pattern = '<table\b'; Allowed = 'ResponsiveTableWrapper'; Message = 'Wrap <table> with <ResponsiveTableWrapper>' }
)

$files = Get-ChildItem -Path $root -Recurse -Include '*.tsx','*.ts' | Where-Object { $_.FullName -notmatch 'node_modules|dist|\.test\.' }

foreach ($rule in $forbidden) {
    foreach ($file in $files) {
        $lines = Get-Content $file.FullName -Encoding utf8
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match $rule.Pattern) {
                # Check if the same file imports the allowed wrapper
                $fileContent = Get-Content $file.FullName -Raw -Encoding utf8
                $hasWrapper = $fileContent -match $rule.Allowed
                if (-not $hasWrapper) {
                    $relPath = $file.FullName.Replace($PSScriptRoot + '\', '')
                    Write-Host "::warning file=$relPath,line=$($i+1)::$($rule.Message)" -ForegroundColor Yellow
                    $exitCode = 1
                }
                break  # One warning per file per rule
            }
        }
    }
}

if ($exitCode -eq 0) {
    Write-Host '✅ Responsive guard passed — all tables wrapped, no raw grid-cols-2/3/4' -ForegroundColor Green
} else {
    Write-Host '⚠️  Responsive guard found issues — see warnings above' -ForegroundColor Yellow
}

exit $exitCode
