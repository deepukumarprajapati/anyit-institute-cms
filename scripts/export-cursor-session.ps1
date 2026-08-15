# Export latest Cursor agent transcript into docs/session-history
# Run from repo root. Cursor must have produced a transcript for this project.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repo "docs\session-history"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$projectsRoot = Join-Path $env:USERPROFILE ".cursor\projects"
$candidates = Get-ChildItem -Path $projectsRoot -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "agent-transcripts" -and $_.FullName -notmatch "\\subagents\\" } |
  Sort-Object LastWriteTime -Descending

if (-not $candidates) {
  Write-Host "No agent transcripts found under $projectsRoot"
  exit 1
}

$src = $candidates[0]
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$dest = Join-Path $outDir "export-$stamp.jsonl"
Copy-Item $src.FullName $dest -Force
Write-Host "Exported:"
Write-Host "  from: $($src.FullName)"
Write-Host "  to:   $dest"
Write-Host "Commit docs/session-history when you want this on another laptop."
