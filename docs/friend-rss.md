# 好友 RSS 与每日一读

## 添加订阅

在 `src/data/friends.ts` 的对应友链对象里设置可选的 `rss` 字段，支持 RSS 2.0、Atom 和 RSS 1.0。没有订阅的站点省略此字段即可，友链仍正常展示。

```ts
{
  name: "好友博客",
  url: "https://example.com/",
  rss: "https://example.com/rss.xml",
  // avatar、description、category 等原有配置保持不变
}
```

构建会把订阅清单输出为 `dist/community/friend-feeds.json`，随博客一起发布。订阅地址只维护这一处，不需要手工复制到 sleepy。

## sleepy 每日缓存

sleepy 提供 `GET /blog/friend-feeds`，博客通过现有的 `/api` 代理（或 `PUBLIC_SLEEPY_API_BASE`）读取。每个订阅仅返回日期最新的一篇有效文章，内容转成纯文本，并限制标题和摘要长度。

- 使用 `python server.py` 启动时，后台检查任务随服务启动；其他 WSGI 入口会在第一次 API 访问时启动。
- 每 24 小时读取一次好友订阅；清单变化时提前更新。后台每分钟检查是否到期，不会每分钟请求好友网站。
- 每次检查的时间、结果均写入磁盘。每月重启不会清空记录；已经到期时补查，尚未到期时复用缓存。
- 某站读取失败时保留该站上次成功的文章，并标注“缓存”；其他站点照常更新。首次读取失败显示“暂未获取更新”，不把它当成网站离线。
- 不需要增加 crontab，也不需要浏览器跨域请求外站 RSS。

默认从 `SLEEPY_ARTICLE_MANIFEST` 所在目录读取同级的 `friend-feeds.json`，与博客现有评论清单放在一起。如果服务器布局不同，在 sleepy 环境文件中设置：

```dotenv
SLEEPY_FRIEND_FEEDS_MANIFEST=/var/www/blog/community/friend-feeds.json
SLEEPY_FRIEND_FEEDS_CACHE=/path/to/sleepy-data/friend-feeds-cache.json
```

路径需要指向实际部署目录。清单可只读，缓存目录必须可写；发布 sleepy 代码时保留缓存文件。发布后重启 sleepy，使新增路由和后台检查生效。现有每月重启任务无需调整。

## 展示与随机规则

“每日一读”打开页面时抽取一篇，点击“换一篇”重新抽取；阅读过程中不自动换文。每站只提供最新一篇，且只抽取发布时间距今不足 7 天的文章，满 7 天即排除；无符合条件的文章时显示空状态，不用旧文补位。候选按发布时间加权，越新越容易抽到，权重按 7 天半衰期计算。存在多个候选站点时，连续两次不会选中同一个站点。友链角落的更新时间不受此筛选限制。

文章标题和“读这篇”打开原文，署名打开博客首页。下方友链仍保持原有尺寸与点击行为，角落显示文章发布时间距今多久。日期标签可随访问时间变化；文章数据每天由后端更新。

“换一篇”只访问已有候选数据，不强制抓取外站。RSS 缓存首次准备时页面会短暂重试；后端不可用时显示说明，不阻塞友链访问。

## 本站 RSS 入口

左侧个人卡片的 RSS 按钮直接复制本站 `https://blog.tonks.top/rss.xml`，成功时显示反馈；自动复制失败时显示可手工复制的地址。介绍页 `/rss/` 已移除，真正的 `/rss.xml` 订阅端点和页面头部的自动发现链接继续保留。

## 验证

- 博客：`node --test scripts/friend-reading.test.mjs`、`pnpm check`、`pnpm build`。
- sleepy：`python -m unittest tests.test_friend_feeds tests.test_all_apis tests.test_release_package`。
- 本地联调：先构建博客，让 sleepy 的清单配置指向本地 `dist/community/friend-feeds.json`，再将博客开发代理 `SLEEPY_DEV_PROXY_TARGET` 指向本地 sleepy 地址。开发验证使用独立的 `SLEEPY_DATA_DIR`，避免触碰生产数据。
