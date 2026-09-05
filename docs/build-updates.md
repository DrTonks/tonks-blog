# 构建更新检测

## 行为

每次 Astro 构建由 `scripts/build-version.mjs` 生成一个 UUID，同时注入 HTML 的 `tonks-build` meta 和前端运行时，输出根 `version.json`。不需要手动修改 package.json 版本；回滚部署也会被识别为不同构建。

生产模式首次进入、标签重新可见、恢复联网时检查；后台标签不检查，同一标签常规检查间隔不少于一分钟，长时间阅读每三分钟检查一次。开发模式不开启提示。请求使用 no-store 和随机查询参数；离线、超时或版本文件无效时不打断旧页面。

发现不同版本后显示右下角轻提示。稍后只隐藏当前版本提示；下一次普通站内导航完整加载新版，保留新标签打开、外链和同页锚点行为。立即更新保存当前阅读位置，再以构建查询参数完整加载页面。位置恢复尊重加载完成前后的用户滚动输入，不清除主题、身份或其它站点存储。

输入过表单/文本区时，立即更新要求确认；有已知更新时的站内点击会提示先保存输入。正常 SPA 导航完成后清除旧页面的输入标志。输入保护是保守的变更检测，不是自动草稿保存，无法检测跨域 iframe 内的编辑。

切页另有高优先级版本校验，在 Swup HeadPlugin 更换 CSS 之前执行；发现跨构建页面则退出旧 Swup 环境。存在输入时保留原正文/样式/URL并显示提示，否则完整加载目标页。因此旧版本页面缓存不会直接混入新布局。

## 发布

`pnpm build` 正常生成版本文件；本地仅 `astro build` 也会生成。`pnpm ship` 使用更新后的部署脚本。

- 先上传普通资源，再上传 HTML，根 version.json 最后发布。
- 上传失败不发布后续阶段；保留旧指纹资源供旧页面使用。
- CLEAN_REMOTE/cleanRemote 已弃用并忽略，不能再先清空站点。
- SFTP 使用临时文件及 OpenSSH posix-rename 扩展，保证单个文件不会被读取到半截；这不是整个站点的原子切换。服务器不支持该扩展时部署失败，不回退为删除线上文件。
- S3 为资源写入 Content-Type/Cache-Control；需在部署环境另行安装原有可选依赖 @aws-sdk/client-s3。
- 旧页面与旧资源不会自动删除。文章撤回及过期资源清理由维护者单独安排；同名 public 资源仍会被覆盖，长期缓存资源应使用指纹名称。
- 不支持多个发布进程同时向同一目录上传，应由 CI 串行执行发布。
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
