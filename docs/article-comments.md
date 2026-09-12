# 文章与段落评论

非 draft、非加密文章自动启用；不修改 Markdown 正文。主页的三个群聊保持原样。

## 写作与映射

构建时从最终 HTML 的普通段落提取原文，生成稳定段落 ID 和独立清单 `dist/community/comment-manifest.json`。空白规范化、脚注编号不会改变段落身份；唯一原文的段落可移动、前后可插入新段落。修改原文产生新 ID，旧讨论保留快照并标记原文已更新或移除。不做相似度猜测。重复段落使用相邻段落区分，仍有歧义的段落不开放单独评论。

段落是 HTML 的段落块，不包含代码、表格、媒体说明、折叠和隐藏内容。正文格式变化但纯文字不变时沿用 ID。发布后尽量不改原段落；需要大改时，旧讨论仍可从文末查看。

文章 ID 默认由 slug 派生。重命名或移动文章前，从旧构建清单取得 `id`，在 `src/data/article-comment-aliases.json` 中添加 `新slug: 旧id`，即可保持文章归属。该文件应纳入版本控制。清单是可重建产物；真正的评论和历史原文快照保存在后端 SQLite 中。

## 本地审阅

使用 `pnpm dev`，文章评论默认与原有互动一起使用 `SLEEPY_DEV_PROXY_TARGET` 配置的后端。需要隔离数据时显式运行 `pnpm dev:comments-preview`，启动仅监听本机的预览服务（默认 9012）。预览数据库为 `.cache/article-comments-preview.sqlite3`，评论自动通过、不调用 AI；本地管理员密钥为 `local-preview`。正式后端仍使用原有审核和限流。

可设置 `PYTHON` 指定 Python，`SLEEPY_ARTICLE_PREVIEW_PORT` 指定预览端口；设置 `SLEEPY_ARTICLE_DEV_TARGET` 时使用指定的本地后端，不启动预览服务。两站身份读取复用 `tonks_community_identity` 和 `tonks_community_profile`，正式域名共享 `.tonks.top` Cookie；localhost 与正式域名是不同的 Cookie 域。

## 后端接入（发布必须另获批准）

新增 `sleepy/article_comments.py`，由 `server.py` 注册路由；数据仍存于 `SLEEPY_COMMUNITY_DB` 对应数据库，只新增 `article_comments` 表及索引，不迁移或重写原留言表。

正式服务设置 `SLEEPY_ARTICLE_MANIFEST` 指向可信的构建清单文件；未设置时读取后端目录的 `article-comments-manifest.json`。发布时将该清单与同一构建的网页一起交付。后端按文件修改时间缓存清单，不访问博客网络地址，也不在请求阶段解析文章或运行文本匹配。清单应原子替换，数据库应按现有方式备份。

缺失清单时拒绝提交；不在清单中的文章不可访问评论；未知段落拒绝；旧页面新发主评论返回版本过期提示，已有讨论的回复继承原引用。用户提供的 quote 被忽略，原文只取可信清单。

API 前缀 `/blog/community/articles/:articleId`：

- `GET /comments`：20 个主讨论，`before` 游标；可用 `block` 筛选段落，返回真实公开总数和每段计数。
- `GET /comments?root=:id&after=:id`：30 条回复，按时间顺序分页。
- `POST /comments`：沿用昵称、邮箱、网站、正文、parent_id；新增 version 和可选 block_id。
- `PATCH /comments/:id`、`DELETE /comments/:id`：沿用管理员请求头验证。
- `GET /avatar/:id`：不公开原始邮箱的头像地址。

公共列表不显示待审核与拒绝正文，计数只统计公开留言和回复。主讨论的引用快照只保存一次，回复继承 root_id。新功能不包含评论点赞。

## 交互

零评论气泡仅 hover / 键盘聚焦时显露；触摸设备轻点普通段落显露该段入口，不进入全局选择状态。已有评论常驻数量。桌面居中弹窗、手机底部面板；正文引用只用竖线，长段落可展开。阅读不要求身份，写作时自动读取现有身份，无身份才显示身份卡。当前标签页的草稿用 sessionStorage 保存。四主题复用已有语义色，动画仅使用短时透明度和位移，尊重减少动态效果设置。
