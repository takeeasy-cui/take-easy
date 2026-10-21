/* SPDX-License-Identifier: Apache-2.0
 * 基于 kiikoread flasher-integrity.js 修改（Apache-2.0）：take-easy 六段镜像
 * （bootloader / 分区表 / 应用 / 拼音码表 / 两分码表 / otadata）。
 * 中文：将选中的刷机包校验为独立快照，安装器只读取已验证的本地 Blob，避免旧缓存混入其他版本。
 * English: Verify the selected bundle as an independent snapshot; the installer reads
 * validated local blobs instead of stale caches or a changing release.
 */
(() => {
  const names = new Map([[0, "bootloader.bin"], [0x8000, "partitions.bin"],
    [0x10000, "firmware.bin"], [0x410000, "ime_table_pinyin.bin"],
    [0x770000, "liangfen.bin"], [0xC10000, "ota_data_initial.bin"]]);
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  function appVersion(bytes) {
    if (bytes.byteLength < 112 || bytes[0] !== 0xe9 ||
        new DataView(bytes.buffer, bytes.byteOffset).getUint32(32, true) !== 0xabcd5432)
      throw new Error("下载文件不是有效的墨水屏固件，请刷新后重试。");
    const field = offset => new TextDecoder().decode(bytes.slice(offset, offset + 32)).split("\0")[0];
    if (field(80) !== "Read_Pico") throw new Error("下载固件的设备型号不匹配，已停止安装。");
    return field(48);
  }
  async function prepare(manifest, manifestURL) {
    if (!/^\d+(?:\.\d+){1,2}(?:-rc\d+)?$/.test(manifest.version) ||
        manifest.new_install_prompt_erase !== true || manifest.builds?.length !== 1 ||
        manifest.builds[0].chipFamily !== "ESP32-S3" || manifest.builds[0].parts?.length !== 6)
      throw new Error("刷机清单无效，请刷新页面后重试。");
    const snapshot = JSON.parse(JSON.stringify(manifest));
    const urls = [], seen = new Set();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
    try {
      const requests = snapshot.builds[0].parts.map(part => {
        const name = names.get(part.offset), info = part.sha256 ? part : null;
        if (!name || seen.has(name) || !info || !/^[a-f0-9]{64}$/.test(info.sha256) ||
            !Number.isSafeInteger(info.size) || info.size <= 0)
          throw new Error("刷机包缺少完整性信息，请刷新页面后重试。");
        seen.add(name);
        // 每个基础文件绑定内容哈希下载，绕过所有通用地址的旧缓存。
        // Pin every base part by content hash, bypassing cached mutable aliases.
        const url = new URL(part.path, manifestURL);
        if (url.origin !== new URL(manifestURL).origin)
          throw new Error("刷机文件来源与所选清单不一致，已停止安装。");
        url.searchParams.set("sha256", info.sha256);
        return {part, name, info, url: url.href};
      });
      const results = await Promise.allSettled(requests.map(async ({part, name, info, url}) => {
        const response = await fetch(url, {cache: "no-store"});
        if (!response.ok) throw new Error(`刷机文件下载失败（${response.status}），尚未写入设备。`);
        const data = await response.arrayBuffer();
        if (data.byteLength !== info.size || await digest(data) !== info.sha256)
          throw new Error(`${name} 校验失败，可能收到了旧缓存；已停止安装，请刷新后重试。`);
        if (name === "firmware.bin" && appVersion(new Uint8Array(data)) !== manifest.version)
          throw new Error("固件内部版本与所选版本不一致，已停止安装。");
        const blobURL = URL.createObjectURL(new Blob([data], {type: "application/octet-stream"}));
        urls.push(blobURL);
        part.path = blobURL;
      }));
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], {type: "application/json"}));
      urls.push(url);
      return {url, dispose};
    } catch (error) {
      dispose();
      throw error;
    }
  }
  window.TakeEasyFlasher = Object.freeze({prepare});
})();
