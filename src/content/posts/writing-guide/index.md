---
title: 文章样式备忘录
published: 2026-03-01
draft: false
category: 遇惑求索
tags:
  - 学习笔记
  - Markdown
description: 文章内容的编辑与样式参考备忘录
image: /images/projects/myblog.png
---
:::quote{author="2026-09-06 Tonks 四编"}
最近更新了一下网站的md呈现格式，姑且先写在这里；后续如果有新增的内容，也直接补充在这里。为什么分类是“勘惑求索”呢，因为写出来是用来给我自己答疑的，绝不是为了凑标签数量
:::

这实际上是一份样式备忘录。

# 基础 Markdown

支持标题、粗体、斜体、删除线、列表、任务列表、表格、分隔线、链接、代码和数学公式。标题前的主题色标识自动生成，不用手写符号。

```md
## 二级标题
**强调**、*斜体*、~~删除~~、[链接](https://tonks.top)
- [x] 已完成
- [ ] 待办

行内公式 $E=mc^2$，独立公式用两行 $$ 包围。
```

**强调**、*斜体*、~~删除~~、[链接](https://tonks.top)
- [x] 已完成
- [ ] 待办
## 提示块

```md
> [!NOTE]
> 这是一条说明。

:::tip[自定义标题]
这里可以写 **重点**，也可以放列表。
:::
```

五种类型：`note`、`tip`、`important`、`warning`、`caution`。
> [!NOTE]
> 这是一条说明。


:::tip[写作提示]
样式服务于阅读，提示块不宜太密集。
:::

## 折叠块

```md
:::fold{summary="展开技术细节"}
这里支持段落、列表、代码、图片。
:::
```

默认收起，添加 `open="true"` 可默认展开。原生 `<details><summary>标题</summary>…</details>` 也能使用；推荐指令语法，内部 Markdown 更方便。

:::fold{summary="展开技术细节"}
这里是补充材料。

- 支持 **重点标记**
- 支持嵌套列表

```js
console.log('Hello, world!');
```
:::

## 引用与署名

普通引用仍使用 `>`，保留轻量的左侧标线。需要卡片时使用新增的 `quote`：

```md
:::quote{author="—— Tonks · 写作笔记"}
记录当下，也给未来留一扇窗。
:::
```

:::quote{author="—— Tonks · 写作笔记"}
记录当下，也给未来留一扇窗。

- 这里也支持列表与代码。
<p style="text-align:center">居中的引文。</p>
<p style="text-align:right">—— 署名</p>
:::

原始 HTML 的居中、右对齐同样可用：

```html
<p style="text-align:center">居中的引文。</p>
<p style="text-align:right">—— 署名</p>
```

<p style="text-align:center">居中的引文。</p>
<p style="text-align:right">—— 署名</p>
## 卡片

站内文章卡片自动读取标题、摘要、封面：

```md
::post{slug="kaifa02/tonks-home-desktop-system"}
```

::post{slug="kaifa02/tonks-home-desktop-system"}

GitHub 仓库卡片（已有，信息加载依赖 GitHub 网络）：

```md
::github{repo="DrTonks/tonks-blog"}
```

::github{repo="DrTonks/tonks-blog"}

音乐扩展使用已有的 `audio`，需要真实音频地址；不会自动播放：

```md
::audio{src="/audio/example.mp3" title="音频标题"}
```

音频放在 `public/audio/`，也支持 HTTPS 地址。上面路径是占位示例，需要替换为实际文件。

## 图片与图注

```md
![替代描述](./photo.jpg "这段文字显示在图下")
![没有图注](./photo.jpg)
```

独占一段的图片自动居中、带主题图框与加载效果。说明放在 title，alt 用于无障碍描述。图片文件名的大小写必须完全匹配。

## 脚注

```md
这句话有补充说明[^note]。

[^note]: 角标支持悬停、聚焦或点击查看；启用预览后不再显示文末注释区。
```

这句话有补充说明[^note]。

[^note]: 角标支持悬停、聚焦或点击查看；启用预览后不再显示文末注释区。

## 隐藏内容

```md
:spoiler[悬停即可阅读的内容]

:::spoiler{warning="包含结局，确定继续阅读吗？"}
需要确认后再显示的内容。
:::
```

普通隐藏内容可点击固定展开；警告模式确认后，本次阅读不再重新遮挡。隐藏内容不是加密。

:spoiler[悬停即可阅读的内容]

:::spoiler{warning="包含结局，确定继续阅读吗？"}
需要确认后再显示的内容。
:::

## 视频嵌入

可写 HTML iframe。请使用平台提供的嵌入地址，提供 title，并关闭标签：

```html
<iframe src="https://www.youtube.com/embed/视频ID" title="视频标题" style="width:100%;aspect-ratio:16/9;height:auto" loading="lazy" allowfullscreen></iframe>
```

## 落款

```md
:::signature
Tonks · 2026 年 9 月 6 日
:::
```

参考文章的落款使用右对齐的一列表格，标准 Markdown 也能渲染；这里提供专门的指令，避免借用表格语义。

:::signature
Tonks · 留给下一次写作的备忘
:::

## 引用中的不同字体

截图里的特殊字形来自局部 `font-family: serif`，不必更换整篇文章字体。可以用以下系统宋体风格辅助类；不同设备的实际字体略有差异：

```html
<p class="article-serif-center">「记录当下，也给未来留一扇窗。」</p>
<p class="article-serif-right">—— Tonks · 写作笔记</p>
```

:::quote
<p class="article-serif-center">「记录当下，也给未来留一扇窗。」</p>
<p class="article-serif-right">—— Tonks · 写作笔记</p>
:::

也可以直接写 `<span style="font-family:serif">局部文字</span>`。只对需要的段落应用即可，列表与解释文字仍使用正文默认字体。

若要各设备显示完全一致的某款字体，需要自行提供 WOFF2 字体文件，而不是仅写一个设备未必安装的字体名称。将文件放到 `public/assets/font/`，再在 `src/styles/article.css` 定义，例如：

```css
@font-face {
  font-family: "ArticleSerif";
  src: url("/assets/font/article-serif.woff2") format("woff2");
  font-display: swap;
}
.custom-md .my-serif { font-family: "ArticleSerif", serif; }
```

然后在文章里写 `<p class="my-serif">文字</p>`。这是配置示例，本项目没有附带这个占位字体文件；请替换成你准备使用的字体。中文字体通常较大，按实际用字裁剪可减少下载量。
