# Take Easy 固件发布站 · 工作交接文档

> **给接手的 AI 助手（TeleAgent）**：读完本文档即可完整接手本项目，无需其他上下文。本文档随仓库同步最新状态。

## 项目一句话

**Take Easy** —— 小纸 Pico（RDP-G01-W，ESP32-S3）墨水屏阅读固件的发布站。
品牌语："放轻松，你已经开始准备放松了" · 功能定位："为摸鱼设计" · 基于 Kiiko 厂长开源固件 **kiikoread** 修改开发，输入法引用 **YanReader**（致谢必须保持显著位置）。

## 已上线资产

| 资产 | 地址 | 说明 |
|---|---|---|
| 主力站 | https://take-easy.pages.dev | Cloudflare Pages |
| 备用站 | https://takeeasy-cui.github.io/take-easy/ | GitHub Pages，与主力站内容一致 |
| 代码仓库 | https://github.com/takeeasy-cui/take-easy | public，main 分支即网站 |

网站结构（仓库根）：
- `index.html` 主页 · `install/` 在线刷机页（esptool-js + Web Serial，浏览器直连烧录）
- `downloads/` 下载页 · `docs/` 使用说明 · `changelog/` 更新日志
- `assets/vendor/esptool.js` 官方 esptool-js 0.7.0（单文件 ESM）
- `assets/icons/` 狐狸 Q 版图标（透明 PNG，4 个尺寸，favicon + 导航 + Hero）
- `firmware/manifest.json` 刷机页数据源（版本列表 + 烧录参数 + 文件清单）

## 新电脑初始化

前置：git + Node.js 18+。clone 后在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

自动完成：依赖检查 → wrangler 装到 ./tools → Cloudflare 浏览器授权 → GitHub PAT 注入引导。

## 凭证（不在仓库内，需新电脑重新配置）

- **Cloudflare**：`wrangler login` 浏览器点 Allow（用户账号为 189 邮箱注册，登录 https://dash.cloudflare.com）
- **GitHub**：用户账号 takeeasy-cui。PAT 生成：https://github.com/settings/tokens → Generate new token (classic) → 勾 `repo`。注入命令（替换 <PAT>）：
  ```powershell
  "protocol=https`nhost=github.com`nusername=takeeasy-cui`npassword=<PAT>`n" | git credential approve
  ```
- PAT 有效期建议 30 天，到期 git push 失败时按同法重新生成注入。

## 日常发布（一条命令）

```powershell
.\publish.ps1 "v0.2.0 版本说明"
```

自动执行：git push（备用站 1-2 分钟自动重建）+ wrangler deploy（主力站秒级更新）。

## 当前待办（按优先级，2026-10-30 更新）

1. **【staging 完成 · 备用站发布 → 待实测 → 主力站】V2.0 大版本定稿**（固件 esp_app_desc 版本 2.0 = manifest 2.0，应用镜像 3,867,264B sha dc06cc7a…）：
   - `firmware/v2.0/` + `firmware/releases/2.0/`：五段件（bootloader/分区表/ime/otadata 与 1.0.5 同 sha，应用新构建）+ Pico-update.bin；manifest 与 releases.json 最新版均置 2.0
   - **资源下载区开放**（`workshop/#resources`，随剧作工坊首次上线）：text-yanxiayao (1.0MB) / text-mingmo (1.5MB) / text-17sui (5.1MB) / novel-huapi (6KB) / bbk-fmj (315KB) 五包，文件在 `firmware/resources/`
   - 17sui 定稿口径：采用素材修复 v2 轮（zip 内烘焙时间 10:58-11:03，blank 昼景 224-240 平滑浅底/夜景纯黑=坏图重生成正稿；11:45 轮 blank 仍是全动态范围噪点，弃用）
   - TF 升级闸门升级（`main/ota_update.c`）：2.0 起接受 "1.0"/"2.0" 双前缀（2.0 设备可回退 1.0.x 或直升 2.x）；**1.0.x 老设备升 2.0 必须走网页刷机**（旧固件闸门只认 1.0），changelog/工坊资源区均已注明
   - 版本定义改动：`D:\readpico-rc95\CMakeLists.txt` else 分支 PROJECT_VER "2.0"（发布铁律：站点 manifest 升版必须同步）
2. **实测清单（备用站 https://takeeasy-cui.github.io/take-easy/ 待 git push 生效后）**：
   - `install/` 显示 V2.0 且五段完整性校验通过（本地已验：appVersion='2.0'、project='Read_Pico'、五段 sha 对 manifest）
   - `workshop/#resources` 五个下载按钮全部可下载
   - 真机：v2.0 刷入后应用页出现「文绎」「步步高游戏」；文绎中键菜单→退出自动存档回列表；《檐下谣》《伏魔记》可玩
   - 全部过检后 **wrangler deploy 主力站**（publish.ps1 是双发命令，本流程改手动只跑 wrangler 步）
3. **apps.png 截图更新**：为 9 应用旧截图，与 V2.0 实机应用页（含文绎/步步高游戏）不一致，待重截替换。

## 国内访问 GitHub 的经验（重要）

- github.com 默认 DNS 解析到 20.205.243.166 **经常被阻断**；hosts 固定节点可解（管理员权限改 `C:\Windows\System32\drivers\etc\hosts`，备份 `hosts.bak-teleagent`）
- **当前可用节点 140.82.114.3**（hosts 指向它）。测试节点**不能只测 TCP 443**，必须实测 git 端点完整响应：
  ```
  curl --max-time 12 --resolve github.com:443:<IP> -o NUL -w "%{http_code}" "https://github.com/takeeasy-cui/take-easy.git/info/refs?service=git-upload-pack"
  ```
  返回 200 才可用（教训：140.82.113.3 TCP 通、主页 200，但**静默丢弃 git 请求**）
- `api.github.com` 真实 DNS 为 20.205.243.168（可用 --resolve 直连）；**hosts 里不要把 api.github.com 指到 github.com 网页 IP**（会 301 重定向）
- GitHub release 下载慢：走 `https://gh-proxy.com/` 前缀加速（14.8MB 的 gh CLI 约 1 分钟）
- 本机 clone 也走 gh-proxy 前缀镜像（2026-10-20 实测可用）；clone 后 `git remote set-url origin <官方地址>` 恢复直连（push 时配 PAT）。**本机 hosts 当前无 GitHub 固定节点**（上文 140.82.114.3 的 hosts 配置已不存在，需直连时要重新固定）

## 历史教训（避免重复踩坑）

- **esptool 5.5 merge-bin 语法**：`--chip esp32s3` 必须放在子命令前；偏移与文件是成对裸参（`0x0 bootloader.bin 0x8000 partition-table.bin ...`），**不支持** `@0x0 文件` 写法（@ 前缀会被当作「参数文件」展开报 FileNotFoundError）

- **.ps1 中文脚本必须存为 UTF-8 with BOM**：PowerShell 5.1 读无 BOM 文件按 GBK 解析，中文注释会破坏语法
- **189 邮箱**对海外网站验证链接拦截激进（弹"外部链接安全提示"且"继续访问"按钮可能无响应）——解法：右键邮件里的链接"复制链接地址"，新标签页手动打开
- 固件图标原图为白底 2048×2048 JPG（右下角带"豆包AI生成"水印）：程序化抠图方案 = flood fill（阈值 242，从边缘抠白保内部白色）+ 水印区域矩形清除（512 图坐标 y478-506, x412-506）+ 边缘 2px 灰度抗锯齿；工具 Python 3.12 + Pillow + numpy
- 浏览器验证邮件链接后跳 `localhost:8976` 显示"无法访问"是**正常现象**（wrangler 回调后即关闭服务）

## 品牌/内容规范

- 固件名 **Take Easy**；开源致谢位置显著（主页 Hero 下横幅 + 全部页脚）：基于 Kiiko 厂长 kiikoread 修改开发、输入法引用 YanReader
- **仅适用小纸 Pico（RDP-G01-W）**：刷机页顶部红色警示、免责声明齐全（非官方发布、刷机有风险请备份、TF 卡数据不受影响）
- UI 极简：白底 + 淡蓝主色（#3b82f6）、扁平、紧凑、毛玻璃弹窗——延续用户长期设计偏好
- 更新网站后**必须双站同步**（publish.ps1 已内置），只更一个站视为未完成

> AI生成
