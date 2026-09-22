$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "请先安装 Node.js 22"
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "请先安装 uv"
}

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}
if (-not (Test-Path node_modules)) {
    & npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path apps/api/.venv)) {
    & uv sync --project apps/api
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& npm run dev
exit $LASTEXITCODE
