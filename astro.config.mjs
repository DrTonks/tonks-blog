import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import svelte from "@astrojs/svelte";
import tailwind from "@astrojs/tailwind";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import { defineConfig } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkGithubAdmonitionsToDirectives from "remark-github-admonitions-to-directives";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { expressiveCodeConfig } from "./src/config.ts";
import { pluginCustomCopyButton } from "./src/plugins/expressive-code/custom-copy-button.js";
import { pluginLanguageBadge } from "./src/plugins/expressive-code/language-badge.ts";
import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";

function getLocalEnvValue(name) {
	const processValue = process.env[name]?.trim();
	if (processValue) return processValue;
	const projectRoot = dirname(fileURLToPath(import.meta.url));

	for (const filename of [".env.local", ".env"]) {
		let contents;
		try {
			contents = readFileSync(resolve(projectRoot, filename), "utf8");
		} catch {
			continue;
		}

		const match = contents.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "m"));
		if (!match) continue;

		const value = match[1].trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1).trim();
		}
		return value.replace(/\\s+#.*$/, "").trim();
	}

	return "";
}

const sleepyDevProxyTarget = getLocalEnvValue("SLEEPY_DEV_PROXY_TARGET");
if (process.env.NODE_ENV !== "production") {
	console.info(`[sleepy proxy] ${sleepyDevProxyTarget ? "configured" : "not configured"}`);
}
const sleepyProxyDiagnostics = {
	name: "sleepy-proxy-diagnostics",
	apply: "serve",
	configureServer(server) {
		console.info(`[sleepy proxy] effective ${server.config.server.proxy?.["/api"] ? "enabled" : "missing"}`);
	},
};
const sleepyDevProxyFallback = {
	name: "sleepy-dev-proxy-fallback",
	apply: "serve",
	enforce: "post",
	configureServer(server) {
		if (!sleepyDevProxyTarget) return;
		const forwardRequest = async (request, response, next) => {
			const requestUrl = request.url || "";
			if (!requestUrl.startsWith("/api/")) {
				next();
				return;
			}

			try {
				const upstreamUrl = new URL(requestUrl.replace(/^\/api/, ""), sleepyDevProxyTarget);
				const headers = new Headers();
				for (const [name, value] of Object.entries(request.headers)) {
					if (value && !["connection", "content-length", "host"].includes(name)) {
						headers.set(name, Array.isArray(value) ? value.join(", ") : value);
					}
				}

				const init = {
					method: request.method,
					headers,
				};
				if (request.method !== "GET" && request.method !== "HEAD") {
					init.body = request;
					init.duplex = "half";
				}

				// Keep the backend's 302 visible to the browser. Following it here would
				// make the dev proxy report qlogo's final status (for example 400) as if
				// sleepy itself had rejected the avatar request.
				const upstream = await fetch(upstreamUrl, {
					...init,
					redirect: "manual",
				});
				response.statusCode = upstream.status;
				upstream.headers.forEach((value, name) => {
					if (!["connection", "content-encoding", "content-length", "transfer-encoding"].includes(name)) {
						response.setHeader(name, value);
					}
				});
				if (!upstream.body) {
					response.end();
					return;
				}
				Readable.fromWeb(upstream.body).pipe(response);
				console.info(`[sleepy proxy] fallback ${request.method} ${requestUrl} -> ${upstream.status}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[sleepy proxy] fallback ${request.method} ${requestUrl} failed: ${message}`);
				if (!response.headersSent) {
					response.statusCode = 502;
					response.setHeader("Content-Type", "application/json");
					response.end(JSON.stringify({ success: false, message: "开发代理无法连接后端" }));
				}
			}
		};
		return () => {
			// Astro's trailing-slash middleware is unshifted during its
			// configureServer post-hook, so unshift this one afterwards to
			// let /api requests reach the development proxy first.
			server.middlewares.stack.unshift({ route: "", handle: forwardRequest });
		};
	},
};
// https://astro.build/config
export default defineConfig({
	site: "https://blog.tonks.top/",

	base: "/",
	trailingSlash: "always",
	integrations: [
		tailwind({
			nesting: true,
		}),
		swup({
			theme: false,
			loadOnIdle: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			containers: ["main"],
			// 保留 Scroll Plugin 的前进/后退位置缓存，但跨页不要启动一段
			// 接管视口的加速滚动。默认配置会先等内容替换，再滚动到目标，
			// 因而产生“静滞一下后才动”以及和滚轮输入争抢的手感。
			smoothScrolling: {
				doScrollingRightAway: true,
				animateScroll: {
					betweenPages: false,
					samePageWithHash: false,
					samePage: false,
				},
			},
			cache: true,
			preload: true, // 悬停链接时预取；避免预取首页全部可见文章
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			resolveUrl: (url) => url,
			// @swup/astro 1.x 不会把 animateHistoryBrowsing 传给 Swup；
			// 该选项会在 Layout.astro 拿到全局实例后启用。
			skipPopStateHandling: (event) => {
				// 跳过锚点链接的处理，让浏览器原生处理
				return event.state?.url?.includes("#");
			},
		}),
		icon({
			include: {
				"preprocess: vitePreprocess(),": ["*"],
				"fa6-brands": ["*"],
				"fa6-regular": ["*"],
				"fa6-solid": ["*"],
				mdi: ["*"],
				"simple-icons": ["*"],
			},
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.theme, expressiveCodeConfig.theme],
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				pluginLanguageBadge(),
				pluginCustomCopyButton(),
			],
			defaultProps: {
				wrap: true,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			styleOverrides: {
				codeBackground: "var(--codeblock-bg)",
				borderRadius: "0.75rem",
				borderColor: "none",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
				codeLineHeight: "1.5rem",
				frames: {
					editorBackground: "var(--codeblock-bg)",
					terminalBackground: "var(--codeblock-bg)",
					terminalTitlebarBackground: "var(--codeblock-topbar-bg)",
					editorTabBarBackground: "var(--codeblock-topbar-bg)",
					editorActiveTabBackground: "none",
					editorActiveTabIndicatorBottomColor: "var(--primary)",
					editorActiveTabIndicatorTopColor: "none",
					editorTabBarBorderBottomColor: "var(--codeblock-topbar-bg)",
					terminalTitlebarBorderBottomColor: "none",
				},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
			},
			frames: {
				showCopyToClipboardButton: false,
			},
		}),
		svelte(),
		sitemap(),
	],
	markdown: {
		remarkPlugins: [
			remarkMath,
			remarkReadingTime,
			remarkExcerpt,
			remarkGithubAdmonitionsToDirectives,
			remarkDirective,
			remarkSectionize,
			parseDirectiveNode,
			remarkMermaid,
		],
		rehypePlugins: [
			rehypeKatex,
			rehypeSlug,
			rehypeMermaid,
			[
				rehypeComponents,
				{
					components: {
						github: GithubCardComponent,
						note: (x, y) => AdmonitionComponent(x, y, "note"),
						tip: (x, y) => AdmonitionComponent(x, y, "tip"),
						important: (x, y) => AdmonitionComponent(x, y, "important"),
						caution: (x, y) => AdmonitionComponent(x, y, "caution"),
						warning: (x, y) => AdmonitionComponent(x, y, "warning"),
					},
				},
			],
			[
				rehypeAutolinkHeadings,
				{
					behavior: "append",
					properties: {
						className: ["anchor"],
					},
					content: {
						type: "element",
						tagName: "span",
						properties: {
							className: ["anchor-icon"],
							"data-pagefind-ignore": true,
						},
						children: [
							{
								type: "text",
								value: "#",
							},
						],
					},
				},
			],
		],
	},
	vite: {
		plugins: [sleepyProxyDiagnostics, sleepyDevProxyFallback],
		server: {
			host: "127.0.0.1",
			...(sleepyDevProxyTarget
				? {
						proxy: {
							"/api": {
								target: sleepyDevProxyTarget,
								changeOrigin: true,
								rewrite: (path) => path.replace(/^\/api/, ""),
								configure: (proxy) => {
									proxy.on("proxyRes", (proxyResponse, request) => {
										console.info(`[sleepy proxy] ${request.method} ${request.url} -> ${proxyResponse.statusCode}`);
									});
									proxy.on("error", (error, request) => {
										console.error(`[sleepy proxy] ${request.method} ${request.url} failed: ${error.message}`);
									});
								},
							},
						},
					}
				: {}),
		},
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
		},
	},
});
