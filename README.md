# Tonks Blog

基于 Astro 构建的个人博客，保留了 Fuwari 清爽的内容结构，并围绕文章阅读、个性化外观和低开销动态效果进行了持续深度改造。

> 本项目由 [saicaca/fuwari](https://github.com/saicaca/fuwari) 修改而来。感谢原作者及后续社区项目提供的基础设计与实现。

## 主要特色

- 桌面端与移动端独立的 Banner 轮播图，并提供平滑的背景衔接效果。
- 亮色、暗色主题和以切换按钮为中心扩散的主题切换动画。
- 可调主题色、文章列表/网格布局、水波纹开关，访客选择会保存在浏览器本地。
- 暗色星光与鼠标光晕、亮暗主题侧边装饰图等低开销环境效果。
- 网格文章卡片、分类、标签、归档、项目、历程和相册等内容页面。
- 文章页侧栏AI摘要：以打字机动画展示，并与目录逻辑隔离。
- Pagefind 静态搜索、Swup 无刷新导航、RSS/Atom、站点地图和 Open Graph 支持。
- Markdown 扩展、KaTeX 数学公式、Mermaid、Expressive Code 与 PhotoSwipe 图片浏览。
- 根据站点实际文本生成 Hanalei 字体子集，减少不必要的字体体积。

## 技术栈

- [Astro](https://astro.build/) 
- [Tailwind CSS](https://tailwindcss.com/) 
- [Svelte](https://svelte.dev/) 
- [Swup](https://swup.js.org/)
- [Pagefind](https://pagefind.app/)

## 本地开发

环境要求：

- Node.js 20 或更高版本
- pnpm 9.14.4
- Python 3（字体子集脚本需要 `fonttools` 和 `brotli`）

```bash
pnpm install
python -m pip install -r requirements-font.txt
pnpm dev
```

开发服务器默认运行在 `http://localhost:4321`。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 生成开发用字体子集并启动开发服务器 |
| `pnpm build` | 构建站点、生成最终字体子集和 Pagefind 索引 |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm new-post <文件名>` | 创建文章 |
| `pnpm font:subset` | 单独运行字体子集生成流程 |
| `pnpm format` | 使用 Biome 格式化 `src` |

项目继承了一些暂不影响构建和发布的历史类型问题，因此当前不以 `pnpm check` 全量通过作为构建前提。

## 内容与配置

- 站点、导航栏、Banner、主题和侧栏：`src/config.ts`
- 文章：`src/content/posts/`
- AI摘要生成位置：`src/content/ai-summaries.json`
- 关于页等独立内容：`src/content/spec/`
- 项目、历程、相册等数据：`src/data/`
- 公共图片与字体：`public/assets/`

文章 Frontmatter 示例：

```yaml
---
title: 文章标题
published: 2026-01-01
description: 用于卡片与 SEO 的文章简介
author: DrTonks
image: ./cover.webp
tags: [Astro, 前端]
category: 开发记录
draft: false
pinned: false
showCoverInContent: false
---
```

摘要数据以文章 slug 为键。AI摘要由本地脚本送deepseek生成，不会写入 Markdown 正文，也不会进入文章目录。若有需要可自行修改和总结摘要：

```json
{
  "example-post": "这里填写简短摘要。"
}
```

## 构建与部署

```bash
pnpm build
```

静态产物位于 `dist/`，可以部署到 GitHub Pages、Cloudflare Pages、Vercel、Netlify 或任意静态文件服务器。发布前请在 `astro.config.mjs` 中确认 `site` 与 `base` 符合目标地址。

仓库内的 GitHub Actions 可以构建并发布 `main` 分支。字体子集是正式构建的一部分，因此 CI 环境也需要安装 `requirements-font.txt` 中的 Python 依赖。

## 致谢与许可

本项目基于 [saicaca/fuwari](https://github.com/saicaca/fuwari) 修改，并继续采用 [MIT License](LICENSE)。原项目版权信息保留在许可证文件中。
