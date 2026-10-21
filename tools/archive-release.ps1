# ============================================================
# archive-release.ps1 — 发布前归档当前正式版（借鉴上游 archive_current_release.py）
# 在替换 manifest 指向新版本之前运行，原字节保留上一版并校验哈希。
# 用法：
#   .\tools\archive-release.ps1              # 归档 manifest 当前 version
#   .\tools\archive-release.ps1 -Version 1.0 # 显式指定
# 规则：
#   firmware\v<ver>\  ->  firmware\releases\<ver>\（含 manifest 快照 + 哈希校验）
#   并把版本登记进 firmware\releases.json（全版本清单，页面/人工核验用）
# ============================================================
param([string]$Version)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'firmware\manifest.json'
if (-not (Test-Path $manifestPath)) { Write-Host "找不到 firmware\manifest.json" -ForegroundColor Red; exit 1 }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $manifest.version }

$src = Join-Path $root ("firmware\v$Version")
if (-not (Test-Path $src)) { Write-Host "待归档目录不存在: firmware\v$Version" -ForegroundColor Red; exit 1 }

$releasesDir = Join-Path $root 'firmware\releases'
$dst = Join-Path $releasesDir $Version
if (Test-Path $dst) { Write-Host "firmware\releases\$Version 已存在，归档跳过（不可覆盖历史）" -ForegroundColor Yellow; exit 0 }

New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item (Join-Path $src '*') $dst
Copy-Item $manifestPath (Join-Path $dst 'manifest.json')

# 校验六段哈希与 manifest 完全一致（原字节归档）。
$ok = $true
foreach ($p in $manifest.builds[0].parts) {
    $f = Join-Path $dst (Split-Path -Leaf $p.path)
    if (-not (Test-Path $f)) { Write-Host "缺失文件: $f" -ForegroundColor Red; $ok = $false; continue }
    $h = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
    if ($h -ne $p.sha256) { Write-Host "哈希不一致: $(Split-Path -Leaf $f)" -ForegroundColor Red; $ok = $false }
}
if (-not $ok) { exit 1 }

# 登记全版本清单 releases.json。
$releasesJson = Join-Path $releasesDir 'releases.json'
$list = $null
if (Test-Path $releasesJson) { $list = Get-Content $releasesJson -Raw | ConvertFrom-Json }
if (-not $list) { $list = [pscustomobject]@{ schema = 1; updates = @() } }
if (@($list.updates | Where-Object { $_.version -eq $Version }).Count -eq 0) {
    $fw = Join-Path $dst 'firmware.bin'
    if (-not (Test-Path $fw)) { $fw = Join-Path $dst 'Read_Pico.bin' }
    $entry = [pscustomobject]@{
        version    = $Version
        date       = $manifest.updated_at
        notes      = $manifest.notes
        dir        = "releases/$Version"
        firmware_sha256 = (Get-FileHash $fw -Algorithm SHA256).Hash.ToLower()
        firmware_size   = (Get-Item $fw).Length
    }
    $list.updates = @($entry) + @($list.updates)
    $list | ConvertTo-Json -Depth 5 | Set-Content -Path $releasesJson -Encoding UTF8
}

Write-Host "[OK] 已归档 V$Version -> firmware\releases\$Version（哈希校验通过，已登记 releases.json）" -ForegroundColor Green
