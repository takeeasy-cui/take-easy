/* SPDX-License-Identifier: Apache-2.0
 * 基于 kiikoread flasher-integrity.js 修改（Apache-2.0）。
 * V1.0.2：固件五段镜像（bootloader @0 / 分区表 @0x8000 / 应用 @0x10000 /
 * 码表镜像 @0x510000（精简拼音+两分，随刷机内置）/ otadata @0xB10000），
 * ime 分区 4MB→1MB、ota 槽 4MB→5MB（新分区布局，老设备一次性全量刷入）。
 * 词库资源导入已随 B 方案取消，资源段框架保留给游戏包（prepareResource）。
 * 中文：将选中的刷机包校验为独立快照，安装器只读取已验证的本地 Blob，避免旧缓存混入其他版本。
 * English: Verify the selected bundle as an independent snapshot; the installer reads
 * validated local blobs instead of stale caches or a changing release.
 */
(() => {
  const names = new Map([[0, "bootloader.bin"], [0x8000, "partitions.bin"],
    [0x10000, "firmware.bin"], [0x510000, "ime_partition_image.bin"],
    [0xB10000, "ota_data_initial.bin"]]);
  /* V1.0.2（资源导入）：输入法词库资源包的段名表；与固件清单共用同一套校验管线。 */
  const resourceNames = new Map([[0x410000, "ime_table_pinyin.bin"], [0x770000, "liangfen.bin"]]);
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
  /* 校验管线共用：按段名表逐段哈希校验并绑定本地 Blob；
   * expectVersion 非空时校验固件段内部版本（仅固件清单使用）。 */
  async function verifySnapshot(manifest, manifestURL, nameMap, expectVersion) {
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
        const name = nameMap.get(part.offset), info = part.sha256 ? part : null;
        if (!name || seen.has(name) || !info || !/^[a-f0-9]{64}$/.test(info.sha256) ||
            !Number.isSafeInteger(info.size) || info.size <= 0)
          throw new Error("安装包缺少完整性信息，请刷新页面后重试。");
        seen.add(name);
        // 每个基础文件绑定内容哈希下载，绕过所有通用地址的旧缓存。
        // Pin every base part by content hash, bypassing cached mutable aliases.
        const url = new URL(part.path, manifestURL);
        if (url.origin !== new URL(manifestURL).origin)
          throw new Error("安装文件来源与所选清单不一致，已停止安装。");
        url.searchParams.set("sha256", info.sha256);
        return {part, name, info, url: url.href};
      });
      const results = await Promise.allSettled(requests.map(async ({part, name, info, url}) => {
        // 2026-10-30：给校验下载加 5 分钟超时——GitHub Pages 慢/被断时不再无限
        // 卡在“正在校验刷机文件”，超时会直接报“下载失败”提示重试。
        const response = await fetch(url, {cache: "no-store", signal: AbortSignal.timeout(300000)});
        if (!response.ok) throw new Error(`安装文件下载失败（${response.status}），尚未写入设备。`);
        const data = await response.arrayBuffer();
        if (data.byteLength !== info.size || await digest(data) !== info.sha256)
          throw new Error(`${name} 校验失败，可能收到了旧缓存；已停止安装，请刷新后重试。`);
        if (expectVersion && name === "firmware.bin" && appVersion(new Uint8Array(data)) !== expectVersion)
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
  async function prepare(manifest, manifestURL) {
    if (!/^\d+(?:\.\d+){1,2}(?:-rc\d+)?$/.test(manifest.version) ||
        manifest.new_install_prompt_erase !== true || manifest.builds?.length !== 1 ||
        manifest.builds[0].chipFamily !== "ESP32-S3" || manifest.builds[0].parts?.length !== 5)
      throw new Error("刷机清单无效，请刷新页面后重试。");
    return verifySnapshot(manifest, manifestURL, names, manifest.version);
  }
  /* V1.0.2（资源导入）：输入法词库两段资源包——不含固件段，不校验应用版本，
   * 仅哈希快照绑定；写入前后设备数据与设置不受影响。 */
  async function prepareResource(manifest, manifestURL) {
    if (manifest.kind !== "resource" || manifest.type !== "ime-dict" ||
        manifest.builds?.length !== 1 || manifest.builds[0].chipFamily !== "ESP32-S3" ||
        manifest.builds[0].parts?.length !== resourceNames.size)
      throw new Error("资源清单无效，请刷新页面后重试。");
    return verifySnapshot(manifest, manifestURL, resourceNames, null);
  }
  window.TakeEasyFlasher = Object.freeze({prepare, prepareResource});
})()
