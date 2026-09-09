# Sleepy 单一博客图片源评估

实施更新：上述后续方案已部分落地（直接博客URL、同步image/images、旧项目图片302），详见 [实施结果](./image-pipeline-results.md)。旧文件保留，尚未部署；以下为实施前评估记录。

2026-09-08：sleepy 干净工作区执行 git pull --ff-only，从 9c5c12a 快进至远端 main b8b290c34ffa542f096ec05e26987508b080195f（留言置顶/软删除更新）。没有改动、删除其业务代码或 images 目录，没有部署。

## 最新代码确认

- sleepy/server.py:944 `_blog_image_path` 仍要求同名文件存在于 sleepy 的 IMAGES_DIR，缺失时从 images 数组中移除。
- :998 `fetch_blog_extra` 请求博客 projects.json/timeline.json，返回精选项目/时光机，给结果额外设置 images，但原 image 字段未归一化。
- :2538 `/images/<path:filename>` 仍从 sleepy/images 提供实体文件。
- tonks-home/src/api/blog.ts 的 getImageUrl 已原样接受 http(s) 绝对 URL。
- ProjectCard.vue 实际读取 project.image，不是 images；只改 _extract_images 不足以修复当前项目封面。当前 TimelineCard.vue 不渲染图片，但 API 字段应保持兼容。
- 已存在 SLEEPY_BLOG_BASE_URL，默认 https://blog.tonks.top，可复用，不必新增第二套重复配置。带 https://tonks.top/ Referer 实测博客 fc2026-1.jpg 返回200；不代表所有远程图片都经过完整可用性检查。

## 推荐：后端返回博客绝对 URL，浏览器直连

例如 `/images/projects/fc2026-1.jpg` → `https://blog.tonks.top/images/projects/fc2026-1.jpg`。图片唯一源头是博客，sleepy 仅负责输出链接，不下载、不复制、不转码、不逐图发 HEAD 检查，也不再检查其本地文件是否存在。

不要依赖本机 ../blogExample/public 的相对目录或符号链接。生产两项目未必同机/同一文件系统，使用 HTTP 图片地址适用于现有分离部署。一般 img 展示无需新增 CORS；如果未来要读 canvas 像素则另行配置。上线前仍需检查实际前端 CSP、防盗链与 HTTPS，不假定所有代理配置已允许。

建议实现边界：

1. 用共享解析函数验证并规范化博客图片路径；固定可信博客 origin，允许预期 /images/ 路径，拒绝 scheme-relative URL、反斜杠、目录穿越及编码绕过，不做任意 URL 代理。
2. 在 fetch_blog_extra 返回副本上同步处理 image（项目字符串/时光机数组）和 images；不改博客源 JSON，不改变管理方式。
3. 旧 `/images/projects/...` 请求可做受限的临时重定向到博客地址，兼容旧前端/缓存；仅对明确博客图片子路径生效，不改变音乐封面和其他本地文件服务。避免301长期固化，先302及短缓存。
4. 保留旧图片文件作为过渡期回滚资料，停止维护即可；验证线上新URL和旧路由均可用后，才单独批准清理，不在本轮删除。
5. 单元测试覆盖项目 image 字段、时光机 images、中文/空格/大写扩展名、缺失本地副本也返回博客地址、越界路径拒绝和旧路由兼容；真实前端验证项目封面。

## 与 WebP 流水线的关系

第一阶段先返回博客原路径即可消除双份维护，不必等待本地图库优化。之后博客构建发布原路径→展示URL的公开清单，sleepy 可缓存清单并优先返回优化图；清单不可用或没有对应项则继续原图。不要手工维护第二张映射表，不要推测 `.webp` 后缀或指纹。

代价：图片可用性和图片带宽转由博客承担；浏览器可能增加到博客域名的一次连接。后端少了图片传输/存储负担。若博客挂掉，静态图仍可能命中浏览器缓存，但不是离线保证。内容不变的原路径替换可能沿用既有一天缓存；后续指纹优化URL解决这一点。

本轮遵循“先拉最新再评估”的边界，尚未实施上述后端行为变更。博客本轮已接通 OSS WebP；本地图库自动构建映射仍待实施，不应把评估报告当成已上线功能。
