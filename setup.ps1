# ============================================================
# Take Easy 固件发布环境 · 新电脑初始化脚本
# 用法：clone 仓库后，在仓库根目录运行
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# 前置要求：已安装 git 和 Node.js（18 以上，含 npm）
# ============================================================
$ErrorActionPreference = 'Stop'
Write-Host "=== Take Easy 固件发布环境初始化 ===" -ForegroundColor Cyan

# ---------- 1) 检查依赖 ----------
$missing = @()
foreach ($tool in @('git', 'node')) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $tool 已安装"
    } else {
        Write-Host "[缺] $tool 未安装" -ForegroundColor Red
        $missing += $tool
    }
}
# npm 在 Windows 上通常是 npm.cmd
if (Get-Command npm -ErrorAction SilentlyContinue) { $npmOk = $true }
elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) { $npmOk = $true }
else { $npmOk = $false }
if ($npmOk) { Write-Host "[OK] npm 已安装" } else { Write-Host "[缺] npm 未安装" -ForegroundColor Red; $missing += 'npm' }

if ($missing.Count -gt 0) {
    Write-Host "`n请先安装缺失的依赖（git: https://git-scm.com · Node.js: https://nodejs.org），再重新运行本脚本。" -ForegroundColor Red
    exit 1
}

# ---------- 2) 安装 wrangler（Cloudflare CLI）到本地 tools 目录 ----------
Write-Host "`n>>> 安装 wrangler 到 ./tools（不影响系统环境）..." -ForegroundColor Cyan
$npmCmd = (Get-Command npm -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source }
& $npmCmd install wrangler --prefix ./tools --no-audit --no-fund 2>&1 | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "wrangler 安装失败，请检查网络后重试" -ForegroundColor Red; exit 1 }

$wrangler = Join-Path '.' 'tools\node_modules\.bin\wrangler.cmd'
if (-not (Test-Path $wrangler)) { $wrangler = 'npx wrangler' }
Write-Host "[OK] wrangler 就绪"

# ---------- 3) Cloudflare 授权 ----------
Write-Host "`n>>> 授权 Cloudflare 账号（浏览器会弹出授权页，点 Allow）..." -ForegroundColor Cyan
Write-Host "    如暂不需要更新 Cloudflare，可按 Ctrl+C 跳过这步继续往后。"
try {
    & $wrangler login
    & $wrangler whoami 2>$null
} catch {
    Write-Host "Cloudflare 授权未完成，之后可手动运行: $wrangler login" -ForegroundColor Yellow
}

# ---------- 4) GitHub 推送凭据 ----------
Write-Host "`n>>> GitHub 推送凭据配置" -ForegroundColor Cyan
Write-Host @"
本机推送代码需要 GitHub Personal Access Token（PAT）。
生成地址: https://github.com/settings/tokens  (Generate new token (classic), 勾选 repo)
拿到 ghp_ 开头的令牌后，把下面命令里的 <你的PAT> 换掉并运行（只需一次，存入 Windows 凭据管理器）:

  "protocol=https``nhost=github.com``nusername=takeeasy-cui``npassword=<你的PAT>``n" | git credential approve
"@ -ForegroundColor White

Write-Host "`n=== 初始化完成 ===" -ForegroundColor Green
Write-Host "日常发布固件：把 bin 放进 firmware/ 并更新 manifest.json 后，运行:"
Write-Host "  .\publish.ps1 `"v版本号 说明`""