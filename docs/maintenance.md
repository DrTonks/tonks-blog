# 维护与发布指南

本页是当前仓库的操作入口。历史执行结果存放在 [archive](README.md#历史记录)，不作为发布授权或验收依据。

## 日常修改

1. 在独立分支修改，通过 `git status` 和 `git diff` 确認范围。
2. 内容入口以 [src/data/README.md](../src/data/README.md) 为准，不使用历史文档中的旧 `public/data` 管理路径。
3. `pnpm dev` 检查页面；需要动态互动时配置自己获授权使用的 sleepy 后端。不要为前端测试向正式评论区写入测试内容。
4. 原图保持受版本管理，沿用图片自动优化及友链本地头像机制。不要仅凭文件较大或未被文本搜索命中就删除素材。

## 提交前验证

```bash
pnpm check
pnpm build
pnpm test:production
pnpm preview
git diff --check
```

`pnpm check` 检查 Astro / TypeScript 类型，CI 会在构建前执行，类型错误必须修复后再提交。`pnpm build` 完成 Astro、字体子集、Pagefind 和资源 / 样式 / 来源指纹检查。构建期间不要改源文件；修改后必须重新构建。类型问题的基线与修复见 [Astro check 修复记录](astro-check-fixes.md)。

预览时检查首页、文章、About / Friends，以及受改动影响的页面；外观修改再覆盖亮暗主题、移动视口和站内切换。自动检查不能证明所有视觉、动态 API 与缓存场景正确。

## 发布由维护者执行

贡献 PR 不要求部署。获得本版本发布批准并确认目标配置后，维护者才使用 `pnpm ship`。它会重新构建、验证并发布，不是预览命令。真实服务器地址、密钥及私有部署配置不能提交。

普通 build / ship 沿用 `site-version.json`；需要通知访客更新时显式使用 `--bump-version`，成功后将版本文件纳入提交。详见 [构建更新检测](build-updates.md)。

使用 sleepy 文章评论时，前端网页与 `dist/community/comment-manifest.json` 必须来自同一次构建；维护者需要确认后端读取的清单同步完成。静态上传本身不代表后端已同步。

SFTP 压缩包发布、服务器能力和回滚要求见 [实现说明](blog-archive-deployment.md)。其中的服务器目录及历史测试只适用于原环境，fork 不应直接沿用。

## 失败与恢复

- 构建或校验失败：修复本地原因并重建，不跳过门禁上传。
- 发布连接中断：先确认当前线上版本；不能假定失败意味着没有切换。
- `node scripts/deploy.js --status` 用于查看状态；`--recover` 会写状态，`--rollback` 会切换线上版本，后两者仍需维护者授权。
- 回滚涉及文章评论映射时，应核对清单与网页版本一致；不要用删除评论数据库代替版本恢复。
- 保存故障原因、修复和实际验证结果；不要将旧回执复用为新版本证明。
