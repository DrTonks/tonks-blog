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

## 投票讨论

卡片使用 `poll:<投票ID>` 作为文章评论的 block_id，复用现有评论、回复树、审核与邮件通知。构建产物的文章评论清单记录可信标题，不包含选项答案。普通投票无需投票即可讨论；提问由后端按当前身份是否存在答题记录授权，答错同样解锁。根评论、直接回复查询、发表根评论/回复、分页和计数均受保护；管理员模式例外。匿名汇总计数不包含提问讨论。前端接收投票状态事件后刷新文章留言和卡片入口。

不以浏览器声明的已投票状态作为权限依据。清除身份或更换设备后不会继承解锁；同一 ID 的题意不允许修改，改题使用新 ID。评论正文可能有剧透，因此整棵题目讨论树在作答前不返回。投票评论不额外公开具体选择。部署顺序仍为后端先更新，随后博客 `pnpm ship`，本次须单独获得发布批准。

本地回归：启动 `pnpm dev:comments-preview` 后，可使用 `POLL_TEST_ORIGIN` 和 `POLL_TEST_API` 指定前端与隔离后端地址，运行 `node scripts/test-poll-discussions.mjs`。默认端口分别为 4335、9013；脚本仅接受 127.0.0.1 且后端必须声明 preview，写入的本轮测试留言结束后自动删除。Playwright 不在依赖中时可通过 `PLAYWRIGHT_MODULE_PATH` 指向其模块文件。
