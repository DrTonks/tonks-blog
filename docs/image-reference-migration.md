# 图片引用审计与迁移评估

最新实施结果：本地图库构建优化与sleepy直连已经完成，见 [管理流程和实测结果](./image-pipeline-results.md)。下文保留原审计过程，不代表当前仍未实施。

更新：OSS 11 张 WebP 已由用户上传，全部内容哈希核验一致，src/config/cdn.ts 已改用新 URL，原本地 PNG fallback 保留。44页构建与4项测试通过，真实浏览器确认横幅 WebP 解码。尚未部署博客。以下“未切换”描述属于原导出阶段；本地图库仍为评估阶段。Sleepy 最新远端代码和单图源建议见 [后端评估](./sleepy-blog-image-source.md)。

本轮交付 CDN 文件，评估本地迁移，不直接批量改名/删除图片、不切换未上传的 CDN URL。完整逐图、逐文件行号清单在项目外 `../blog-image-webp-upload/local-reference-audit.md`，机器可读数据为同名 JSON。可通过 `scripts/export-image-audit.mjs` 重建至新的输出目录。

## 范围与结论

扫描了 src、public、scripts 文本引用，检查整个仓库相关路径及 myserver 其他项目的同类引用；审计 albums/projects/covers/home/桌面和移动 banner 六类，共 115 张图片。结合相册动态路径、项目 JSON、运行时请求、Astro 内容生成与分享元数据检查，不能仅依赖搜索固定 URL。未访问 OSS 或生产数据库，所以不承诺枚举互联网上、缓存页面中或远端动态数据的全部引用。

| 资源与引用入口 | 传播到哪里 | 迁移需要覆盖 |
| --- | --- | --- |
| public/images/albums，72 张 | 7 个可见本地相册、相册封面、主页无锡贴纸 | album-scanner、albums 列表/详情、HomeStickerLayer |
| public/data/projects.json，9 条 image | ProjectsClient 运行时 fetch；projects.ts 构建时读取；在建项目贴纸随机池 | 两种加载路径都必须转换，不能只改组件 img |
| public/data/timeline.json | TimelineClient 初始 SSR 与客户端刷新；18 条图片路径 | SSR 和 fetch 后归一化两条路径均接入 |
| src/data/home-stickers.ts | 固定图、images 数组、项目动态池，序列化到 data-sticker-images 后随机设 img.src | 对整个候选池转换，不只首张图 |
| 10 篇文章的 public 封面 | PostCard、可选正文封面、文章 banner、Markdown 站内引用卡片、分享/结构化数据 | 除 ImageWrapper 外还需 Markdown、文章生成和元数据路径 |
| personalWebsite2.png | about.astro → getCdnUrl → img.tonks.top/blog/personalWebsite2.png | CDN 例外，已包含在上传包，不属于纯本地迁移 |
| home/home.png | 导航头像、身份贴纸、友链申请/公开头像 URL | 保留外部兼容地址，不删除 |

文章对应：bianyiyuanli1、fingerprint、Git、es6、lunbotuCSS、Tailwindcss、searchbar 使用 covers；loanWebend、loanBackendModel、writing-guide 使用 projects。详情及行号见逐图清单。

实际交叉引用例子：personalWebsite.png 同时在项目 JSON、时光机、贴纸；loanrisk.png 同时在项目 JSON、时光机、文章封面；myblog.png 同时在时光机、贴纸、文章封面。贴纸还直接引用本地 d5.png，因此 CDN banner 替换并不能自动覆盖贴纸。

## 已发现的迁移陷阱

1. album-scanner.ts 硬编码必需 cover.jpg；改成 cover.webp 会让整个相册跳过。扫描列表只排除 cover.jpg，直接加 cover.webp 又会把它误当正文照片；同目录新增变体还会重复照片。
2. 相册图片 ID 按排序后的 index 生成，随意增删文件可能改变 ID；mtime 又被作为照片日期，重新生成文件可能改变显示日期。不能通过重命名粗暴迁移。
3. 相册缩略图与 Fancybox data-src 目前是同一 photo.src，需分开；Photo 已有 thumbnail 字段，但本地模板尚未使用。
4. ExternalExample 是 hidden 的外链相册（picsum.photos），不属于本地转换，也不要下载它；7 个可见相册当前是本地模式。
5. 文章 src 内的导入图片已有 Astro 优化，本审计集中于 public 共享资源，不重复压缩那些图片。
6. 已确认跨项目运行时依赖：sleepy/server.py:685 的 fetch_blog_extra 读取博客 projects.json/timeline.json；:631 的 _blog_image_path 去掉 /images/ 前缀后检查 IMAGES_DIR 中是否存在同名文件，不存在则返回 None 并丢弃图片。tonks-home/src/api/blog.ts:58 消费 /blog-posts，再经 /images/ 代理展示这些图片。直接修改博客 JSON 的后缀会让后端本地文件匹配失败，除非同步迁移后端素材。本轮不修改这两个项目，明确保留原 JSON 资源路径，只在博客显示层解析优化版本。远端实际部署文件/数据库未访问。

## 编码试算（未替换本地图库）

保持像素尺寸、自动方向校正、quality 85 WebP，未做缩略图尺寸削减：

| 类别 | 现有 | 全部转换试算 | 差异 |
| --- | ---: | ---: | ---: |
| 相册 72 张 | 21,040,943 B | 12,948,382 B | 约 -38.5% |
| 项目 24 张（含 CDN 例外） | 6,778,601 B | 1,107,394 B | 约 -83.7% |
| 独立封面 7 张 | 598,140 B | 56,140 B | 约 -90.6% |

并非每张 WebP 都更小：金沙 cover.jpg 试算增加 3,353 B、无锡 IMG_9422.JPG 增加 26,475 B。实际流水线应保留更小的原格式，而不是强制全库 WebP。项目里的文字截图需独立对比高质量/无损版本，以上仅体积试算，不是逐图画质验收结论。

## 推荐实施方案

保留源路径作为资源 ID，并保留现有可访问原文件。构建生成独立 `/_images/<内容指纹>-<尺寸>.webp` 与清单，不放回相册扫描目录。相册建议列表最长边 800、放大最长边 2048（不放大原图），提供原图入口；最终按实际布局/DPR验收。项目和封面建议 640/1280 两档，含文字的截图提高质量或无损；有损输出变大则保留原格式。

构建端 ImageWrapper、Markdown、相册扫描与贴纸序列化统一使用清单解析器；客户端 ProjectsClient、TimelineClient 的初始值和 fetch 结果同样解析。找不到映射的新增/远程图片直接使用原 URL，不能拼接一个不存在的 .webp。保留原元数据的 ID、日期、尺寸与原图 URL。

这样文章 frontmatter、项目 JSON、时光机 JSON 无需逐项改后缀，旧部署和外链仍可用。等网站内所有显示入口验证后，再讨论是否把原图移出部署包；直接保留原图+派生图会增加部署体积，但降低实际下载量。若要同时减少部署体积，需要额外的兼容重定向或原图托管决策，本轮不擅自做。

验证门槛：构建检查每条清单目标存在、重复资源去重、hash/尺寸正确、无变体被相册二次扫描；浏览器检查7相册封面/数量/日期/放大、项目分类/运行时刷新、时光机 SSR/刷新、贴纸随机池、文章卡片/正文/元数据；冷缓存与旧缓存下都不能出现新增图片404。不要使用全站运行时 DOM 替换或 MutationObserver，避免额外主线程与时序成本。

## CDN 上传

项目外 `../blog-image-webp-upload/upload/blog/` 按目录结构上传至 img.tonks.top 对应桶根目录：banner 放 `blog/banner/`，left/right/personalWebsite2 放 `blog/`。项目配置没有桶名称或反向代理重写详情，上传后需核对 README 所列实际 URL。共 11 张 559,356 B，保留原尺寸；源图合计 5,439,563 B。先上传/验证，再修改 CDN 映射及预加载，本地 fallback 原路径暂不删除。本轮没有任何云端写入。
