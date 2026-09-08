# 构建更新检测

## 行为

构建版本保存在受 Git 管理的 `site-version.json`。普通构建读取并沿用它，只有明确使用 `--bump-version` 才生成新 UUID；整个构建（Astro、字体子集、搜索索引）成功后才写回版本文件。HTML meta、运行时和根 `version.json` 使用同一 ID。`builtAt` 每次构建变化，但它不触发更新提示。

不会根据文件变化自动升版：仅修改 `src/content/`、`public/` 不会升版，其他源码微调也不会。需要提醒读者更新时由你显式升级；该参数不受修改路径限制。

生产模式首次进入、标签重新可见、恢复联网时检查；后台标签不检查，同一标签常规检查间隔不少于一分钟，长时间阅读每三分钟检查一次。开发模式不开启提示。请求使用 no-store 和随机查询参数；离线、超时或版本文件无效时不打断旧页面。

发现不同版本后显示右下角轻提示。稍后只隐藏当前版本提示；下一次普通站内导航完整加载新版，保留新标签打开、外链和同页锚点行为。立即更新保存当前阅读位置，再以构建查询参数完整加载页面。位置恢复尊重加载完成前后的用户滚动输入，不清除主题、身份或其它站点存储。

输入过表单/文本区时，立即更新要求确认；有已知更新时的站内点击会提示先保存输入。正常 SPA 导航完成后清除旧页面的输入标志。输入保护是保守的变更检测，不是自动草稿保存，无法检测跨域 iframe 内的编辑。

切页另有高优先级版本校验，在 Swup HeadPlugin 更换 CSS 之前执行；发现跨构建页面则退出旧 Swup 环境。存在输入时保留原正文/样式/URL并显示提示，否则完整加载目标页。因此旧版本页面缓存不会直接混入新布局。

## 发布

| 命令 | 行为 |
| --- | --- |
| `pnpm build` | 构建，沿用版本，不部署 |
| `pnpm build --bump-version` | 构建成功后升级版本，不部署 |
| `pnpm ship` | 构建并部署，沿用版本 |
| `pnpm ship --bump-version` | 构建成功后升级版本，再部署 |

升级后将 `site-version.json` 一并提交。普通 CI 执行 `pnpm astro build` 只校验构建，既不升级版本，也不部署。开发者直接使用 Astro CLI 时也读取版本文件；升级参数仅由上述 build/ship 命令处理。部署失败时保留本地已构建版本，下次普通 ship 可重试同一版本。

版本文件初始值沿用本机已有构建 ID，不会因迁移策略额外随机生成新版本。

- S3 仍按普通资源、HTML、根 version.json 的顺序发布；SFTP 则整体校验后一次切换站点目录。
- SFTP 将 dist 打包为 tar.gz，一次上传压缩包及校验清单，服务器验证全部内容后使用 Linux renameat2 原子交换两个实目录；不再预先清空线上网站。
- 上传、校验或解压失败不切换旧站；切换后若连接中断，先用 `node scripts/deploy.js --status` 查看状态，必要时 `--recover` 完成状态恢复。
- CLEAN_REMOTE/cleanRemote 已弃用并忽略。成功发布后保留当前和上一版私有归档，可用 `node scripts/deploy.js --rollback` 切回上一版。
- 新流程需要本地 Python 3.9+、服务器 Python 和支持 renameat2 的同一文件系统；不支持时明确失败，不回退为删除线上目录。当前服务器已在隔离目录验证支持，Apache 路径保持不变。
- 操作说明、备份策略、测试与提速评估见 [压缩包发布说明](blog-archive-deployment.md)。
- S3 为资源写入 Content-Type/Cache-Control；需在部署环境另行安装原有可选依赖 @aws-sdk/client-s3。
- 已打开的旧页面可能因旧资源被删除而遇到 404，刷新后使用新站点。S3 仍为覆盖上传，不自动清理旧对象。
- 建议 CI 串行发布；SFTP 使用独立上传目录，并通过服务器文件锁拒绝同时进行的状态修改或版本切换。
- 部署脚本纳入 Git；私有 deploy.config*.json、环境文件及密钥继续忽略。

## 必须配合的缓存规则

`version.json`: `Cache-Control: no-store`；HTML: `no-cache`（每次使用前校验）；带内容指纹的 `_astro/` 资源可 `public, max-age=31536000, immutable`。不要让 CDN 对 HTML 采用忽略查询参数的长期强缓存。

仓库的 public/.htaccess 已包含 Apache 规则；public/_headers 补充支持该格式的静态托管平台版本文件规则。Nginx 不读取这两个文件，需在站点配置中设置同等响应头，例如：

```nginx
location = /version.json {
    add_header Cache-Control "no-store" always;
}
```

HTML 与 `_astro/` 应整合进既有 Nginx location/cache 配置，不直接覆盖现有路由。首次上线本功能时，旧 HTML 还没有检测脚本，必须通过正确的 HTML 缓存规则或 CDN 失效使访客至少加载一次新页面。

## 验证

- 连续真实构建 A/B，旧标签检测新版本，更新后恢复 1800px，URL移除临时版本参数。
- 跨版本切页且含未提交文本时，旧HTML、CSS、输入和正文可见性保留。
- 提前用户滚动发生在DOMContentLoaded、load之前时，保持用户选择的300px，不覆盖为保存的1800px。
- 390px手机端无横向溢出；部署阶段/失败屏障/MIME缓存等4项测试通过。
- 未运行真实部署。上线后的CDN与服务器响应头仍需在实际环境确认。
