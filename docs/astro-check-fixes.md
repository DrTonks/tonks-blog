# Astro check 类型错误修复记录

基线：2026-09-21，`pnpm check` 检查 139 个文件，51 errors / 0 warnings / 60 hints。以下行号为修复前位置。

## 初始错误清单

| 文件与位置 | 诊断 |
| --- | --- |
| `src/components/misc/GitHubRepoCard.astro:25:2` | ts(2322): Type '{ children: any[]; id: string; class: string; href: string; target: "_blank"; rel: string; repo: `${string}/${string}`; "data-repo-state": string; }' is not assignable to type 'AnchorHTMLAttributes'. |
| `src/components/widget/DynamicSideBar.astro:140:9` | ts(2322): Type '{ headings?: MarkdownHeading[] \| undefined; class: string; style: string; }' is not assignable to type 'IntrinsicAttributes & Props & Props & Record<string, any> & Props & Props'. |
| `src/components/widget/DynamicSideBar.astro:115:9` | ts(2322): Type '{ headings?: MarkdownHeading[] \| undefined; class: string; style: string; }' is not assignable to type 'IntrinsicAttributes & Props & Props & Record<string, any> & Props & Props'. |
| `src/components/widget/NavMenuPanel.astro:58:40` | ts(2339): Property 'external' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:56:44` | ts(2339): Property 'name' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:55:70` | ts(2339): Property 'icon' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:55:44` | ts(2339): Property 'icon' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:52:43` | ts(2339): Property 'external' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:51:46` | ts(2339): Property 'external' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:48:77` | ts(2339): Property 'url' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:48:61` | ts(2339): Property 'url' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/components/widget/NavMenuPanel.astro:48:44` | ts(2339): Property 'external' does not exist on type 'NavBarLink \| LinkPreset'. |
| `src/constants/link-presets.ts:32:22` | ts(2339): Property 'gallery' does not exist on type 'typeof I18nKey'. |
| `src/constants/link-presets.ts:31:14` | ts(2339): Property 'Gallery' does not exist on type 'typeof LinkPreset'. |
| `src/i18n/languages/en.ts:197:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/i18n/languages/en.ts:196:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/i18n/languages/en.ts:195:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/i18n/languages/en.ts:194:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/i18n/languages/en.ts:193:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/i18n/languages/en.ts:192:2` | ts(1117): An object literal cannot have multiple properties with the same name. |
| `src/layouts/Layout.astro:2019:5` | ts(2353): Object literal may only specify known properties, and 'infinite' does not exist in type 'TonksFancyboxOptions'. |
| `src/layouts/Layout.astro:1961:5` | ts(2353): Object literal may only specify known properties, and 'infinite' does not exist in type 'TonksFancyboxOptions'. |
| `src/layouts/Layout.astro:1912:7` | ts(2353): Object literal may only specify known properties, and 'preload' does not exist in type 'Partial<CarouselOptions>'. |
| `src/layouts/Layout.astro:1562:25` | ts(2339): Property 'classes' does not exist on type 'SwupRuntime'. |
| `src/layouts/Layout.astro:1560:25` | ts(2339): Property 'visit' does not exist on type 'SwupRuntime'. |
| `src/layouts/Layout.astro:1343:36` | ts(2345): Argument of type '(_visit: any, { page }: { page: any; }) => Promise<void>' is not assignable to parameter of type '(visit: any) => void'. |
| `src/layouts/Layout.astro:1341:45` | ts(2339): Property 'awaitAssets' does not exist on type '{ persistTags: string \| boolean \| ((tag: Element) => boolean); }'. |
| `src/pages/atom.astro:98:39` | ts(2339): Property 'atomBenefit4' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:97:39` | ts(2339): Property 'atomBenefit3' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:96:39` | ts(2339): Property 'atomBenefit2' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:95:39` | ts(2339): Property 'atomBenefit1' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:92:35` | ts(2339): Property 'atomWhatIsAtomDescription' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:88:31` | ts(2339): Property 'atomWhatIsAtom' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:59:31` | ts(2339): Property 'atomLatestPosts' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:49:39` | ts(2339): Property 'atomCopyLink' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:37:66` | ts(2339): Property 'atomCopyToReader' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:36:78` | ts(2339): Property 'atomLink' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:23:35` | ts(2339): Property 'atomSubtitle' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:21:89` | ts(2339): Property 'atom' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:13:70` | ts(2339): Property 'atomDescription' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.astro:13:37` | ts(2339): Property 'atom' does not exist on type 'typeof I18nKey'. |
| `src/pages/atom.xml.ts:6:8` | ts(1259): Module '"node_modules/.pnpm/@types+sanitize-html@2.16.0/node_modules/@types/sanitize-html/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/atom.xml.ts:4:8` | ts(1259): Module '"node_modules/.pnpm/@types+markdown-it@14.1.2/node_modules/@types/markdown-it/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/rss.xml.ts:8:8` | ts(1259): Module '"node_modules/.pnpm/@types+sanitize-html@2.16.0/node_modules/@types/sanitize-html/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/rss.xml.ts:6:8` | ts(1259): Module '"node_modules/.pnpm/@types+markdown-it@14.1.2/node_modules/@types/markdown-it/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/og/[...slug].png.ts:6:8` | ts(1259): Module '"node_modules/.pnpm/sharp@0.34.4/node_modules/sharp/lib/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/posts/[...slug].astro:23:8` | ts(1259): Module '"src/content/ai-summaries"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/posts/[...slug].astro:15:8` | ts(1259): Module '"node_modules/.pnpm/dayjs@1.11.18/node_modules/dayjs/plugin/utc"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/posts/[...slug].astro:14:8` | ts(1259): Module '"node_modules/.pnpm/dayjs@1.11.18/node_modules/dayjs/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/posts/[...slug].astro:12:8` | ts(1259): Module '"node_modules/.pnpm/bcryptjs@3.0.2/node_modules/bcryptjs/umd/index"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |
| `src/pages/posts/[...slug].astro:2:8` | ts(1259): Module '"node:path"' can only be default-imported using the 'allowSyntheticDefaultImports' flag |

## 修复与验证

### 按根因归类

| 根因 | 初始错误数 | 修复方式 |
| --- | ---: | --- |
| Atom 翻译键缺失 | 14 | 补齐 13 个键及简中、繁中、英文、日文文案；其中标题键使用两次 |
| CommonJS 默认导入与模块解析不匹配 | 10 | 使用与 Astro / Vite 一致的 Bundler 解析及 esModuleInterop |
| 移动导航子项仍被标注为预设联合类型 | 9 | 显式描述预设解析后的导航项类型 |
| Swup / Fancybox API 类型过时 | 7 | 使用安装版本的官方声明，并迁移 Fancybox v6 配置 |
| 英文时间单位重复定义 | 6 | 删除重复项，保留原本最终生效的缩写 |
| 组件属性和已移除的 Gallery 预设残留 | 5 | TOC headings 支持省略、仓库卡片使用 data-repo、清理无效预设 |
| **合计** | **51** | 全部解决 |

模块解析修正后，检查器还能识别文章分类可能为 `null`；传入 `PostMeta` 时将其归一为 `undefined`。Swup 的全局声明来自 `@swup/astro/client`，初始化时检查实例是否存在，钩子参数使用库提供的类型推导。没有新增 `any`、`@ts-ignore` 或关闭类型检查来消除错误。

### Fancybox v6 适配

项目已安装 `@fancyapps/ui` 6.1.0，本次未升级依赖。旧配置把插件选项放在根级，并使用旧版按钮名，类型声明与实际 API 均不匹配。

- 将缩略图、工具栏、图片预加载和缩放选项分别放入 `Carousel.Thumbs`、`Carousel.Toolbar`、`Carousel.Lazyload` 和 `Carousel.Zoomable.Panzoom`。
- 将工具栏的 `infobar` / `slideshow` 改为 `counter` / `autoplay`，使用布尔型 `showOnStart`。
- 使用 `zoomEffect` / `fadeEffect` 和 `Carousel.formatCaption` 配置动画与隐藏标题；图片来源由 v6 读取 `data-src` / `href`。
- 三处图片绑定共用配置生成函数，并通过插件的类型扩展检查配置。

### 验证结果（2026-09-21）

- `pnpm check`：139 个文件，**0 errors / 0 warnings / 59 hints**。剩余 hints 包括未使用符号等非阻断诊断，本次未批量清理。
- `pnpm build`：50 个页面构建成功，字体子集和 Pagefind 完成；生产校验通过，检查了 844 个文件、1832 条资源引用及关键 CSS / 构建来源指纹。
- `pnpm test:production`：9 项测试全部通过。
- `git diff --check`：通过。
- 本地生产预览实测：Atom 文案正常显示；从 Atom 切换到文章；文章图片弹层打开、缩放、旋转、切换及关闭正常；390 × 844 移动视口下导航子菜单展开并跳转到相册。
- 浏览器记录中没有 error 级别日志。静态预览未接入 sleepy 后端，浏览量、点赞和评论请求出现预期的 404 / 不可用提示，这些动态接口不属于本次通过项。

CI 已在 Astro build 前加入 `pnpm check`；README、贡献指南和维护指南同步要求运行类型检查。以上结果仅代表本次本地验证，未提交、推送或部署。
