
/**
 * 首屏 LoadingScreen 明确等待的静态资源。
 *
 * `src/assets` 中的图片应先 import，再加入此数组，让 Astro 生成正确的构建 URL。
 * `public` 中的资源也可以直接填写以 `/` 开头的 URL 字符串。
 *
 * IMPORTANT: imported src/assets images may be transformed by astro:assets.
 * In that case, mark the rendered Image/ImageWrapper as loading="eager";
 * LoadingScreen will wait for the real DOM URL. This avoids preloading the
 * original PNG while the page actually displays a generated WebP.
 *
 * Add only exact public or remote URLs to this list.
 */
export const initialLoadingPreloadImages: string[] = [
	"/assets/home/left.png",
	"/assets/home/right.png",
];

/**
 * CDN 映射（供 LoadingScreen 内联脚本在运行时进行 CDN → 本地回退）
 * 由 LoadingScreen.astro 的 define:vars 注入。
 */
export { getCdnMapping as CDN_PRELOAD_MAP } from "./config/cdn";
