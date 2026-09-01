/**
 * OSS/CDN 配置与回退逻辑
 *
 * 图片优先从 OSS CDN 加载（通过 img.tonks.top/blog），
 * 当 CDN 不可达时自动回退到本地 /assets/ 路径。
 */

export const CDN_BASE = 'https://img.tonks.top/blog'

/**
 * 本地路径 → CDN 路径映射表（内部使用，不直接导出）
 * 只包含已上传到 OSS 的文件。
 */
const LOCAL_TO_CDN: Record<string, string> = {
  // home 装饰图
  '/assets/home/left.png': `${CDN_BASE}/left.png`,
  '/assets/home/right.png': `${CDN_BASE}/right.png`,
  '/images/projects/personalWebsite2.png': `${CDN_BASE}/personalWebsite2.png`,
  // 桌面 banner
  '/assets/desktop-banner/d1.png': `${CDN_BASE}/banner/d1.png`,
  '/assets/desktop-banner/d2.png': `${CDN_BASE}/banner/d2.png`,
  '/assets/desktop-banner/d5.png': `${CDN_BASE}/banner/d5.png`,
  '/assets/desktop-banner/d6.png': `${CDN_BASE}/banner/d6.png`,
  // 移动 banner
  '/assets/mobile-banner/m1.png': `${CDN_BASE}/banner/m1.png`,
  '/assets/mobile-banner/m2.png': `${CDN_BASE}/banner/m2.png`,
  '/assets/mobile-banner/m3.png': `${CDN_BASE}/banner/m3.png`,
  '/assets/mobile-banner/m4.png': `${CDN_BASE}/banner/m4.png`,
}

/** CDN → 本地回退路径（由 LOCAL_TO_CDN 自动生成） */
const CDN_TO_LOCAL: Record<string, string> = Object.fromEntries(
  Object.entries(LOCAL_TO_CDN).map(([local, cdn]) => [cdn, local]),
)

// --- CDN 不可达标记 ---
let _cdnFailed = false

/** 标记 CDN 不可达（加载失败时调用）。幂等：重复设置相同值无副作用。 */
export function setCdnFailed(failed: boolean): void {
  if (_cdnFailed === failed) return
  _cdnFailed = failed
}

/** CDN 当前是否不可达 */
export function isCdnFailed(): boolean {
  return _cdnFailed
}

/**
 * 获取图片的最佳 URL
 * - CDN 可达时返回 CDN URL（若已配置映射），否则返回本地路径
 * - CDN 不可达时始终返回本地路径
 */
export function getImageUrl(localPath: string): string {
  if (_cdnFailed) return localPath
  return LOCAL_TO_CDN[localPath] ?? localPath
}

/**
 * 查询本地路径对应的 CDN URL
 * 无映射或 CDN 不可达时返回 null
 */
export function getCdnUrl(localPath: string): string | null {
  if (_cdnFailed) return null
  return LOCAL_TO_CDN[localPath] ?? null
}

/** 获取 CDN URL 对应的本地回退路径 */
export function getLocalFallback(cdnUrl: string): string | null {
  return CDN_TO_LOCAL[cdnUrl] ?? null
}

/**
 * 获取 CDN 映射表的只读快照。
 * 供 Astro define:vars 注入到内联脚本；仅导出此函数而非整张映射表。
 */
export function getCdnMapping(): Readonly<Record<string, string>> {
  return LOCAL_TO_CDN
}
