$ErrorActionPreference = 'Stop'
Write-Host 'MediConnect AI preflight' -ForegroundColor Cyan
foreach ($cmd in @('node', 'npm', 'docker')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd was not found. Install it and reopen PowerShell."
  }
  & $cmd --version
}
Write-Host 'If Docker Desktop is installed, make sure it is running before docker compose.' -ForegroundColor Yellow
Write-Host 'Do not use real patient data in this development build.' -ForegroundColor Yellow
