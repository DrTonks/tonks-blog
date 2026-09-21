# 文档索引

## 当前维护入口

- [维护与发布指南](maintenance.md)：本地验证、发布边界与回滚注意事项。
- [内容维护](../src/data/README.md)：友链、历程、项目等数据入口。
- [文章写作](article-writing.md)、[文章与段落评论](article-comments.md)。
- [图片优化](image-optimization.md)、[友链本地头像](friend-avatars.md)。
- [版本与更新提示](build-updates.md)、[压缩包发布实现](blog-archive-deployment.md)。
- [贡献指南](../CONTRIBUTING.md)、[后续清理候选](cleanup-candidates.md)。

## 历史记录

以下文档保留当时的原因、修复过程和验证依据。原路径保留索引页，避免既有链接失效；历史“已部署 / 未部署 / 已通过”不能作为当前版本的状态。

| 记录 | 内容 |
| --- | --- |
| [2026-09-21 Astro check 修复](astro-check-fixes.md) | 51 条初始错误、API 适配及验证结果 |
| [2026-09-09 发布记录](archive/deployment-2026-09-09.md) | 当次发布范围及其后续样式故障更正 |
| [2026-09-09 图片链路修复](archive/image-pipeline-fix-2026-09-09.md) | 路径、缓存、监听与图片生成修复 |
| [2026-09-09 样式故障](archive/style-build-incident-2026-09-09.md) | 图片 glob 与隐式样式依赖故障 |
| [生产门禁整合记录](archive/production-checks-and-integration.md) | 当次远程整合与验证限制 |
| [图片优化早期实测](archive/image-pipeline-results.md) | 早期参数、路径与体积结果 |

核心经验：图片扫描只匹配图片，样式必须显式引入；构建成功及 HTTP 200 不能替代真实页面验收；原图和旧 URL 是否可删除，必须根据引用和兼容性判断。
