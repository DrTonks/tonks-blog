# 搜索与 Agent 阅读运维

本轮仅本地实施。发布仍遵循 AGENTS.md：本地体验确认后才能部署。不要为了验证而调用 pnpm ship；不部署的完整验证命令是 pnpm build。

## 架构和数据来源

- 博客的 canonical、站点地图过滤共用 `src/utils/search-policy.mjs`。查询参数和 fragment 不进入 canonical；分页 canonical 保留静态页码路径，8/12 条客户端布局不是新的独立内容 URL。
- `src/utils/public-catalog.ts` 通过 Astro 集合生成公开文章，项目沿用 `src/data/projects.ts`，相册沿用现有 scanAlbums。不要手改 dist、复制第二份文章索引或依赖线上 API 构建。
- `/llms.txt` 是入口说明；`/agent/index.json` 为 schemaVersion=1 的只读目录与全文检索数据；`/agent/articles/<slug>.md` 为公开 Markdown 副本。文章页通过 `rel="alternate" type="text/markdown"` 链接副本，副本带原文链接。
- 主页的 `src/config/public-profile.json` 是公开名称、签名、说明和导航的来源。Vite 插件生成初始语义 HTML、robots、sitemap、llms、index.md、agent/site.json、404.html。Vue 挂载后沿用互动主页；无 JS 时初始资料和链接仍可读。这是静态核心内容回退，不是整个浏览器互动应用的 SSR，也没有爬虫 UA 分流。

## 内容边界

草稿和 encrypted=true 的文章（无论是否填写密码）不生成目录和 Markdown。导出只列举公开字段，不序列化 frontmatter；HTML/注释及自定义指令属性被语法树清理。实际 poll 指令整个替换为参与提示，不泄露答案、解释和结果。文章展示出来的代码示例仍然保留。相对源码图片没有可直接公开的编译地址时保留替代文字并引导原文，绝不编造 /src/content 地址。正文中的相对文章链接仅在公开集合存在时解析。

现有 robots 的允许抓取政策保持不变；本次没有替用户选择禁止模型训练。robots 是爬虫约定，不是访问控制。未来调整训练/搜索爬虫规则，应分别明确政策并检查各提供商文档。

## WebMCP

浏览器支持 document.modelContext（或早期 navigator.modelContext）时注册工具；不支持时直接跳过，无 polyfill、计时轮询和失败重试循环。支持接口但注册失败会记录有前缀的警告，不影响网站。

- 博客：`tonks_search_content`（文章/项目/相册，query<=160，limit 1..20，有 offset）；`tonks_read_article`（只接受目录中的精确 id）。
- 主页：`tonks_home_info`、`tonks_find_destinations`，只读取随构建打包的公开资料。
- 不开放投票、评论发布、身份、管理、访客/设备状态、待办或个人会话数据。工具不自动跳转页面。
- 博客目录按需请求，单次页面生命周期共享请求和缓存；失败后下次调用可重试，15 秒超时。读文章验证同源固定路径，并限制大小。查询结果不携带整个检索正文。正文是资料，不是 Agent 指令。
- 这仍是实验性浏览器标准。测试注册适配器和 execute 契约不代表获得所有真实 Agent 的兼容认证；原站点和静态阅读不依赖这项能力。API 变化时集中修改 agent-tools，不改业务页面。

## 构建、检查与维护

博客 `pnpm build` 会生成以上资源；生产校验额外检查目录版本、唯一 id、Markdown 路由、canonical、alternate、结构化数据图片、Sitemap 过滤及文件预算。目录最多 2 MB，单文章最多 200 KB；超额直接构建失败，届时应分片而非静默截断。新增内容会自动进入目录，改为草稿/加密后下次构建自动移除。

```powershell
pnpm test:search
pnpm build
# 使用本机 Playwright 安装位置；浏览器回归脚本不会写线上互动数据
$env:PLAYWRIGHT_MODULE_PATH = 'C:/path/to/playwright/index.mjs'
node scripts/test-search-browser.mjs http://127.0.0.1:4338 http://127.0.0.1:4340
# 批准发布以后，检查两个公开站点的真实 HTTP/MIME/404
node scripts/check-search-http.mjs https://blog.tonks.top blog
node scripts/check-search-http.mjs https://tonks.top home
```

主页 `pnpm build` 包含检索产物校验，`pnpm check:build` 还校验资源依赖；`pnpm test:search` 检查主页工具。浏览器回归需同时启动两站的本地 production preview。

博客当前 SFTP 部署是归档解压后整站原子交换，因此被撤下的 Markdown 不会残留在活动站点；上一版归档仍为私有回滚资料。当前部署前置检查已禁止 S3 发布；未来若重新启用 S3 等逐文件上传方案，必须实现删除旧导出与 CDN 失效，不能只上传新索引。回滚到旧版本也会恢复旧公开内容，涉及隐私撤回时必须重新构建修订版而非回滚。主页生成文件名固定，没有单篇 Markdown 生命周期。

## Apache 发布检查

博客 `.htaccess` 增加 Markdown MIME、txt/md 重验证缓存，以及工具页的 X-Robots-Tag；测试页也有 HTML noindex。主页 `.htaccess` 禁用 FallbackResource，提供自定义 404、MIME 和缓存策略。需要 AllowOverride 允许相关指令，mod_mime/mod_headers；这是部署前需要核对的服务器条件。

**不能仅凭 HTTP 200 判断成功。** 主页原先所有不存在的 txt/xml 路径回退为首页。若虚拟主机使用先于目录规则执行的 catch-all RewriteRule，必须在经批准的发布中调整虚拟主机：真实文件直接服务，仅实际应用路由落到 index.html，未知资源返回 404。当前主页只有 `/` 是有效内容路由；`/api/`、`/images/`、`/music/` 及 `/community/` 的现有代理/Alias 不应改动。Vite preview 的 SPA fallback 不代表 Apache 的生产响应。

发布后上述 HTTP 脚本必须通过，特别是 MIME 和未知路径 404；随后验证无 JS 可读、JS 互动正常、原站点评论功能正常。失败先修复服务器规则，不把 HTML 200 当作 robots 或 Sitemap。

## 性能和后续观察

AST 解析、目录和静态文档生成只发生在构建/开发服务端，不打包进浏览器。普通访问仅增加静态元数据、主页核心 HTML 和小型工具注册代码，无新增后端、轮询或滚动监听。博客工具首次调用才下载目录，随后按需下载一篇 Markdown；正文较多时这部分传输和 JSON 解析有成本，受上述预算约束。

不承诺 AI 收录或引用率；llms.txt 和 WebMCP 都不替代可访问正文、正确元数据及普通搜索优化。通过发布后 HTTP 检查、搜索平台的索引诊断和现有访问日志观察实际效果，不增加用户追踪。文档依据：Chrome WebMCP imperative API、Google JavaScript SEO 与 AI features、llmstxt.org（实施时查阅）。

### 本轮本地验证记录

- 28 篇公开文章、9 个项目、9 个相册；目录 247,916 字节（gzip 测算 110,401 字节），仅调用博客工具时加载。
- 注册模块源码 gzip 测算：博客 2,076 字节，主页 1,059 字节；主页共享资料 gzip 575 字节。这是源码压缩参考，不是实际共享 chunk 的精确增量，也不是 INP/LCP 性能评分。
- 两站普通访问实测 Agent 目录请求为 0；模拟支持接口时主页工具 0 请求，博客一次查询和一篇读取共 2 请求，非法 id 不追加请求，Swup 切页仍只注册两项工具。
- 真实 Edge：两站无 JS 可读；主页 JS 挂载后静态回退消失、原互动主页正常显示；本地与线上博客在 1280px 下首卡宽高均 824×214.78125px，标题字号/行高均 30/36px。截图已检查，按项目规则清理。
- 博客类型检查 0 errors / 0 warnings（61 条既有 hints）；隐私/工具/部署辅助单测 10 项通过，主页工具测试通过。完整构建及检索校验通过，发布后的 Apache HTTP 验收尚未执行。
- 最终完整构建检查 970 个文件、2240 个资源引用；原评论数回归覆盖手机端、动态卡片、归档、模拟点赞和投票，全部通过且脚本错误 0。两站已接入不含部署步骤的 CI 检查，远程 CI 需提交后运行。

### 独立审查与更新边界

三路子 agent 分别复核了博客导出、主页生成/部署以及 WebMCP 工具。修复主页对 HTML 转义后的合法查询链接的构建误判，并将博客读文参数校验移到目录请求前。审查后的博客边界/部署辅助单测共 11 项通过，主页工具和 HTML 特殊字符回归共 2 项通过。

内容变更随下次构建生成、随部署上线，并不是保存后立即发布。项目目录只读取本地 projects.ts，不跟踪远程 GitHub 或后端最新动态。博客工具成功加载的目录在当前文档内缓存，Swup 切页不会刷新，需要完整刷新页面获取新版；外部搜索平台的收录时效由其自身抓取周期决定。

审查修复后的主页完整构建和资源检查通过；博客检索产物独立校验通过。博客完整复建期间发生并行文章编辑，先遇到新增文章缺失封面，随后重试被 Source changed during build 门禁拦截。因此上面的完整构建记录属于上一轮稳定工作区；最新版本应等编辑完成后重新 pnpm build，不能将本轮不完整产物用于部署。两处修复均已由对应子 agent 复审通过。
