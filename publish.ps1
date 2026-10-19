# ============================================================
# Take Easy 一键发布脚本：git push（GitHub 备用站）+ Cloudflare Pages（主力站）
# 用法：在仓库根目录运行
#   .\publish.ps1 "v0.2.0 说明文字"
# 不带参数时自动用时间戳作为提交说明
# ============================================================
$ErrorActionPreference = 'Stop'

$msg = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { "更新 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

# ---------- GitHub ----------
Write-Host ">>> [1/2] 推送 GitHub（代码备份 + 备用站）..." -ForegroundColor Cyan
git add -A
git commit -m $msg 2>$null
if ($LASTEXITCODE -ne 0 -and (git status --porcelain)) {
    Write-Host "git 提交异常，请检查改动内容" -ForegroundColor Red; exit 1
}
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub 推送失败（凭据问题运行 setup.ps1 重新配置；网络问题重试）" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] GitHub 已更新，备用站 1-2 分钟后自动重建"

# ---------- Cloudflare ----------
Write-Host ">>> [2/2] 部署 Cloudflare Pages（主力站）..." -ForegroundColor Cyan
$wrangler = Join-Path '.' 'tools\node_modules\.bin\wrangler.cmd'
if (-not (Test-Path $wrangler)) {
    $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue).Source
    if (-not $npmCmd) { $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source }
    if ($npmCmd) {
        Write-Host "    本地无 wrangler，安装到 ./tools ..."
        & $npmCmd install wrangler --prefix ./tools --no-audit --no-fund 2>&1 | Out-Null
    }
}
if (Test-Path $wrangler) {
    & $wrangler pages deploy . --project-name=take-easy --branch=main --commit-dirty=true 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] 主力站已更新: https://take-easy.pages.dev" -ForegroundColor Green
    } else {
        Write-Host "Cloudflare 部署失败（未授权运行: $wrangler login）" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "未找到 wrangler，跳过 Cloudflare 部署（运行 setup.ps1 配置）" -ForegroundColor Yellow
}

Write-Host "`n=== 发布完成 ===" -ForegroundColor Green
Write-Host "主力站: https://take-easy.pages.dev"
Write-Host "备用站: https://takeeasy-cui.github.io/take-easy/"