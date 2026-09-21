# 文章投票和答题

```markdown
:::poll{id="reading-choice-01" title="你更喜欢哪种阅读方式？"}
- [a] 纸质书
- [b] 电子书
:::
```

增加 `answer="a" explanation="答案解析"` 即为答题模式。2–8 个选项，单选，投票后展示结果；两个选项额外展示左右对比条。ID 全站唯一且永久稳定，选项 ID 不随排序变化。已经同步到后端的题目、选项文字、正确答案及解析均冻结；修改这些内容请用新投票 ID。可调整选项顺序。没有验证码登录，限制的是共享 Cookie 身份，无法阻止清除身份后再次投票。

## 本地与 Obsidian

`pnpm dev` 自动生成 `.cache/poll-definitions.json`（私有完整定义）和 `.cache/polls.json`（公开 ID/版本），监听文章变化。推荐 `pnpm dev:comments-preview`：当相邻目录存在 sleepy 项目且 Python 安装其依赖时，自动启动隔离的本地评论/投票接口、同步定义，不需要先 build，评论和投票不写入线上数据。预览数据库是 `.cache/article-comments-preview.sqlite3`。

如果自行运行本地后端，设置 `SLEEPY_POLL_PUBLIC_MANIFEST` 指向 `.cache/polls.json`，并把私有定义通过 `app.extensions['article_polls'].sync(payload)` 导入本地数据库；后端不会接受访客上传题目。编辑器离线预览支持模拟一票，不连接生产接口，不产生实际票数；真实比例仍以线上结果为准。

格式菜单由 `editor/blog-editor.json` 维护。解析或预览代码变更后执行 `pnpm editor:build`、`pnpm editor:test`。新增格式无需重新安装 Obsidian 插件。

## 部署

先部署兼容的 sleepy 后端，再运行博客 `pnpm ship`。博客构建提取非 draft、非 encrypted 文章中的投票，私有答案只留在 `.cache`，不会进入 dist、Pagefind 或公开清单。公开源码仓库中的 Markdown 答案仍可被查阅，不适合保密考试。

SFTP 发布在切换静态站点前，通过 SSH stdin 将定义导入后端数据库，不公开上传文件。默认后端目录 `/var/sleepy`，解释器 `venv/bin/python`；可用部署配置 `backendRoot` 或 `DEPLOY_BACKEND_ROOT` 指定。后端默认读取文章评论清单同目录的 `polls.json`，也可用 `SLEEPY_POLL_PUBLIC_MANIFEST` 指定。导入失败阻止前端发布；旧版本定义和投票保留，静态站点回滚后可继续使用原版本。公开清单决定哪些投票可以访问，移除文章不会删除票数。

AI 摘要与 RSS/Atom 会跳过互动题目块，避免泄漏解析或提前揭晓答案。投票不接入邮件通知，避免每一次选择都打扰管理员。表格保持标准 Markdown 写法，自动渲染为可横向滚动的卡片。
