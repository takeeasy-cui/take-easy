/* ============================================================
   刷机逻辑 · 基于 esptool-js (Web Serial API)
   兼容 Chrome / Edge 桌面版，需 HTTPS 环境

   用法（页面内联 module 调用，2026-10-21 重构为参数化入口）：
     import { initFlasher } from "<相对本页的 flasher.js 路径>";
     initFlasher("<相对本页的 manifest.json 路径>");
   固件文件 URL 以 manifest 实际地址为基准解析——主站根路径与
   GitHub Pages 子路径部署均正确。

   本次修复的两个 bug（用户 2026-10-21 反馈"读清单卡住+连接按钮无反应"）：
   ① 事件绑定误用不存在的 els.mode（实为 modeCards），脚本在此崩溃，
     后续按钮监听与 loadManifest 均未执行；
   ② 固件/清单 URL 若以页面为基准解析，在 /install/ 子目录下 404。
   ============================================================ */
import { ESPLoader, Transport } from "../vendor/esptool.js";

let els = null;
let manifest = null;
let manifestBase = "";       /* manifest 的最终 URL（fetch 后由 res.url 得到） */
let selectedVersion = null;
let mode = "full";
let transport = null;
let loader = null;
let connected = false;

/* ---------- 日志 ---------- */
function log(msg, cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = msg;
  els.log.appendChild(div);
  els.log.scrollTop = els.log.scrollHeight;
}
const terminal = {
  clean: () => { els.log.innerHTML = ""; },
  writeLine: (d) => log(d),
  write: (d) => log(d, "info"),
};

/* ---------- 步骤指示 ---------- */
function setStep(activeIdx) {
  els.steps.forEach((s, i) => {
    s.classList.toggle("active", i === activeIdx);
    s.classList.toggle("done", i < activeIdx);
  });
}

/* ---------- 工具 ---------- */
async function fetchBinary(url) {
  const abs = manifestBase ? new URL(url, manifestBase).href : url;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`下载失败: ${abs} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function fmtSize(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}

/* ---------- 加载固件清单 ---------- */
async function loadManifest(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifestBase = res.url;
    manifest = await res.json();
  } catch (e) {
    els.version.innerHTML = '<option value="">固件清单加载失败，请刷新重试</option>';
    log(`固件清单加载失败: ${e.message}`, "err");
    return;
  }
  const versions = manifest.versions || [];
  els.version.innerHTML = versions
    .map((v, i) => `<option value="${i}">v${v.version} · ${v.date || ""}</option>`)
    .join("");
  if (versions.length) selectVersion(0);
  log(`已加载固件清单: ${manifest.name}（${versions.length} 个版本）`, "ok");
  log(`目标芯片: ${manifest.chipFamily} · Flash ${manifest.flashSize}`, "info");
}

function selectVersion(idx) {
  if (!manifest) return;
  selectedVersion = manifest.versions[idx];
  if (els.versionDesc) els.versionDesc.textContent = selectedVersion.notes || "";
  renderFiles();
}

function renderFiles() {
  if (!selectedVersion || !els.fileList) return;
  const files = mode === "full" ? selectedVersion.full : selectedVersion.update;
  els.fileList.innerHTML = files
    .map((f) => `
      <div class="file-row">
        <span>${f.name}</span>
        <span class="off">@ ${f.offset}</span>
      </div>`)
    .join("");
}

/* ---------- 连接设备 ---------- */
async function connect() {
  if (!navigator.serial) {
    log("当前浏览器不支持 Web Serial，请使用桌面版 Chrome 或 Edge，并通过 HTTPS 打开本页。", "err");
    return;
  }
  try {
    els.btnConnect.disabled = true;
    els.btnConnect.innerHTML = '<span class="spinner"></span> 连接中…';
    log("请求访问串口设备…");
    const port = await navigator.serial.requestPort();
    log("已选择串口，正在连接并检测芯片…", "info");
    transport = new Transport(port, true);
    loader = new ESPLoader({
      transport,
      baudrate: (manifest && manifest.baudrate) || 115200,
      terminal,
    });
    const chipName = await loader.main();
    connected = true;
    els.chipInfo.textContent = `已连接: ${chipName}`;
    els.chipInfo.classList.add("ok");
    const panel = document.getElementById("flashPanel");
    if (panel) panel.style.display = "";
    log(`连接成功，检测到芯片: ${chipName}`, "ok");
    els.btnConnect.innerHTML = "重新选择设备";
    els.btnConnect.disabled = false;
    els.btnFlash.disabled = false;
    setStep(2);
  } catch (e) {
    connected = false;
    log(`连接失败: ${e.message}`, "err");
    els.btnConnect.innerHTML = "连接设备";
    els.btnConnect.disabled = false;
    try { if (transport) await transport.disconnect(); } catch (_) {}
  }
}

/* ---------- 开始刷写 ---------- */
async function flash() {
  if (!connected || !loader || !selectedVersion) return;
  try {
    els.btnFlash.disabled = true;
    els.btnConnect.disabled = true;
    setStep(2);
    const files = mode === "full" ? selectedVersion.full : selectedVersion.update;
    const eraseAll = mode === "full" && manifest.fullInstallErase !== false;

    log(`开始刷写 ${selectedVersion.version}（${mode === "full" ? "完整安装" : "升级"}）…`, "info");
    if (eraseAll) log("将先擦除整个 Flash，再写入完整镜像。", "warn");

    els.progressWrap.style.display = "block";

    const fileArray = [];
    for (const f of files) {
      log(`下载 ${f.name} …`);
      const data = await fetchBinary(f.url);
      fileArray.push({ data, address: parseInt(f.offset, 16) });
      log(`  ${f.name} ${fmtSize(data.length)} @ ${f.offset}`, "ok");
    }

    await loader.writeFlash({
      fileArray,
      flashMode: manifest.flashMode || "dio",
      flashFreq: manifest.flashFreq || "80m",
      flashSize: manifest.flashSize || "16MB",
      eraseAll,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const pct = total ? Math.min(100, Math.round((written / total) * 100)) : 0;
        els.progressFill.style.width = pct + "%";
        els.progressText.textContent = `文件 ${fileIndex + 1}/${fileArray.length} · ${fmtSize(written)} / ${fmtSize(total)}（${pct}%）`;
      },
    });

    els.progressFill.style.width = "100%";
    els.progressText.textContent = "刷写完成";
    log("刷写成功！正在重启设备…", "ok");
    await loader.after("hard_reset");
    await new Promise((r) => setTimeout(r, 500));
    await transport.disconnect();
    connected = false;
    setStep(3);
    log("设备已断开连接。墨水屏设备可能仍显示旧画面，请等待重启或按电源键唤醒。", "info");
  } catch (e) {
    log(`刷写失败: ${e.message}`, "err");
    log("请保持 USB 连接，检查后重试。如反复失败，可尝试「设置 → 升级和恢复 → BOOT 模式」。", "warn");
  } finally {
    els.btnFlash.disabled = true;
    els.btnConnect.disabled = false;
    els.btnConnect.innerHTML = "连接设备";
  }
}

/* ---------- 入口（页面 DOM 就绪后由内联 module 调用） ---------- */
export function initFlasher(manifestUrl) {
  els = {
    version: document.getElementById("versionSelect"),
    versionDesc: document.getElementById("versionDesc"),
    modeCards: document.querySelectorAll(".radio-card[data-mode]"),
    fileList: document.getElementById("fileList"),
    chipInfo: document.getElementById("chipInfo"),
    btnConnect: document.getElementById("btnConnect"),
    btnFlash: document.getElementById("btnFlash"),
    progressWrap: document.getElementById("progressWrap"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    log: document.getElementById("log"),
    steps: document.querySelectorAll(".flash-steps .step"),
  };
  if (els.version) {
    els.version.addEventListener("change", (e) => {
      if (e.target.value !== "") selectVersion(parseInt(e.target.value, 10));
    });
  }
  els.modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      els.modeCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      mode = card.dataset.mode;
      renderFiles();
    });
  });
  if (els.btnConnect) els.btnConnect.addEventListener("click", connect);
  if (els.btnFlash) els.btnFlash.addEventListener("click", flash);
  if (els.log) log("就绪。点击「连接设备」选择串口开始。", "info");
  setStep(0);
  loadManifest(manifestUrl);
}
