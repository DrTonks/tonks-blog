# 内容维护入口

博客的友链、时间线、项目、建设树和首页贴纸都在本目录维护。修改 TS 后运行 `pnpm dev` 预览，确认后运行 `pnpm build` 构建；使用现有 `pnpm ship` 流程发布。线上内容随构建发布，不再通过修改服务器 JSON 更新。

| 要改什么 | 编辑文件 | 说明 |
| --- | --- | --- |
| 友链名称、介绍、链接、分类、固定方式 | [friends.ts](./friends.ts) | 编辑 `friendsData`；排列顺序就是展示顺序 |
| 个人时间线／时光机经历、日期和图片 | [timeline.ts](./timeline.ts) | 编辑 `timelineData`；按开始日期倒序展示；普通事件的 `image` 使用字符串数组，相册事件使用 `albumId` |
| 项目卡片、状态、技术栈、封面 | [projects.ts](./projects.ts) | 编辑 `projectsData`；列表、统计及首页在建项目贴纸共享这份数据 |
| 网站建设树记录 | [construction.ts](./construction.ts) | 编辑 `constructionData`；新记录放在数组开头；`stage` 可选 seed/trunk/branch/leaf |
| 首页贴纸内容、位置及显示规则 | [home-stickers.ts](./home-stickers.ts) | 编辑 `homeStickerDefinitions`；项目封面来源在 projects.ts 维护 |
| 本地番剧列表 | [anime.ts](./anime.ts) | 本地番剧条目 |

## 图片放哪里

- 友链头像：`public/images/friends/`；文件名（不含扩展名）与 friends.ts 的 `name` 完全一致。缺少本地头像时使用 `avatar` 链接。详见 [头像说明](../../docs/friend-avatars.md)。
- 项目／时间线图片：通常放 `public/images/projects/`，TS 内填写 `/images/projects/文件名.png` 等原始路径；构建自动优化，无需手动填写散列文件名。
- 相册：继续维护 `public/images/albums/相册目录/info.json` 与照片。它属于相册目录元数据，不在本轮四类内容迁移范围内。

## 编辑约定

四份内容 TS 使用明确的接口和数组类型；保持 id 唯一，日期使用 YYYY-MM-DD。可以添加注释和同文件常量。它们同时供构建脚本读取，请保持模块独立，不添加运行时 import（类型导入可以使用）。提交前运行 `pnpm check` 和 `pnpm build` 检查类型、图片及产物。

`/data/projects.json`、`/data/timeline.json`、`/data/friends.json` 和 `/data/construction.json` 由构建自动生成，供外部服务兼容读取；不要编辑 dist 中的这些文件。唯一维护来源是本目录对应 TS，旧 public/data JSON 已移除。

文章仍在 `src/content/posts/`，全站功能开关在 `src/config.ts`。`article-comment-aliases.json` 是文章重命名时保持评论关联的映射，不是页面内容列表，按 [评论文档](../../docs/article-comments.md) 维护。

## 相册时间线

现成示例是 `2024-07-guangzhou-album`（广东之旅）。标题、类型标签与介绍通栏显示；纯文字卡片足够宽时，日期和描述与右侧“纪念留影”贴纸共用高度，窄卡片则上下排布，避免遮字。普通事件关联相册时仍保留原有图片、成果与技能。

在 `timeline.ts` 的 `timelineData` 中添加 `type: "album"` 的事件：

```ts
{
  id: "2026-08-wuxi-album",
  type: "album",
  albumId: "20260821wuxi",
  title: "无锡总决赛期间的影像记录",
  description: "独立写这次经历，不会自动复制相册简介。",
  startDate: "2026-08-20",
  endDate: "2026-08-22",
  location: "江苏 · 无锡",
  // icon: "material-symbols:photo-library", // 可选，默认相册图标
}
```

- `albumId` 对应 `public/images/albums/` 下已有相册的目录名。
- 标题、描述、时间和地点由事件独立维护；时间精确到天，不填 `endDate` 表示当天的事件，不显示“至今”。
- 不填写 `image`。右侧照片贴纸自动使用相册封面，点击在当前页面进入相册；窄卡片中贴纸移到文字下方靠右。
- 多条事件可以关联同一个相册。删除、隐藏关联相册或关闭相册页面前，需先移除对应事件；构建会检查失效关联。
- 封面沿用图片优化与懒加载机制。首页主体宽度、文章列数、分页不受此类型影响。

### 现有事件关联相册

教育、工作、项目、成就和其他已有类型也可以添加 `albumId`，无需改成 `type: "album"`：

```ts
{
  id: "2026-08-career-planner-wuxi",
  type: "achievement",
  albumId: "20260821wuxi",
  title: "第17届中国大学生服创大赛全国总决赛",
  description: "前往无锡参加全国总决赛，获国家级二等奖。",
  startDate: "2026-08-20",
  endDate: "2026-08-22",
  icon: "material-symbols:emoji-events",
  image: ["/images/projects/fc2026-wuxi1.png"],
}
```

只增加右侧相册贴纸，原有分类、图标、日期规则、图片与成就等内容都保留。纯相册事件的 `albumId` 必填；其他类型选填。当前无锡总决赛事件已关联相册，可直接本地预览。
