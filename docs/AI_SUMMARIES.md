# AI 摘要

## 配置与命令

在博客 `.env.local` 填写 `AI_SUMMARY_ENDPOINT`（完整 HTTPS chat/completions 地址）、`AI_SUMMARY_API_KEY` 和 `AI_SUMMARY_MODEL`。示例见 `.env.example`。环境变量优先，其次 `.env.local`，最后 `.env`。不要使用 `PUBLIC_` 前缀，不要提交密钥。

```sh
pnpm ai:summary
pnpm ai:summary --slug memory/memory
pnpm ai:summary --slug memory/memory --force
```

- 默认仅补全非 draft、非加密且没有摘要的文章。发布时间在未来但 draft=false 与现有博客发布规则一致，仍算发布文章。
- 指定文章可使用页面 slug 或 `src/content/posts` 下去掉扩展名的相对路径。
- 已有摘要不会因文章编辑、模型变更或提示词更新而重新请求。
- `--force` 必须指定一篇文章，允许草稿和加密文章，已有则覆盖。其全文会发往所配置的服务；加密文章摘要只存本地数据，前端不展示。
- `pnpm ship` 在原 Astro build 及源文件指纹计算之前运行补全，然后按原顺序构建、字体处理、搜索索引、校验、部署。失败则停止，不上传。
- `pnpm dev`、`pnpm build` 不发起 AI 请求。

## 数据与请求

`src/content/ai-summaries.json` 以文章标识为键，每条记录包含 `summary`、`model`、`generatedAt`。新生成记录还保存 `requestedModel`、`promptVersion`、`contentHash`；模型名优先记录接口响应的实际模型，未返回时使用请求配置。

历史 26 条摘要保留原文，按要求标记 `deepseek-flash`；`generatedAt` 使用文章发布时间，并以 `generatedAtSource: article-published` 标识其不是实测生成时间。历史摘要不强行裁切；新生成严格限制 160 Unicode 字符（含标点/空格）。

请求包含标题与完整 Markdown 正文（不发送 frontmatter 的密码等字段，不下载图片），以及最近十条非草稿、非加密、去重且不含当前文章的摘要示例，按 generatedAt 降序。示例只参考风格，不作为当前文章事实。每篇成功后立即落盘，也能作为后续示例。

输出为单段中文纯文本 JSON。校验长度、结构、换行、Markdown/HTML/链接/表情；最多三次格式纠正，不截断全文或摘要。不自动重试网络/HTTP错误，避免不确定失败反复计费；后续重跑会跳过已成功写入的记录。

原子替换和文件变更检查保护原摘要。`.cache/ai-summary.lock` 防止同时运行两个摘要命令；若进程被强杀，确认没有任务在运行后才可手动删除锁文件。

前端使用系统字体，模型名称随文章导航同步；没有 AI 摘要时按文章简介展示，不伪造生成来源。API密钥只用于构建脚本，不进入前端。

## 验证

`pnpm test:ai-summary` 使用模拟接口和临时文章，不发送真实请求。上线前本地查看 `pnpm dev`，确认内容后再运行 `pnpm ship`。
