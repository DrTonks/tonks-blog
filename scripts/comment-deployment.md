# 文章评论发布联动

`pnpm ship` 会校验 `dist/community/comment-manifest.json`，并在正式目录切换后检查每篇文章的公开评论接口。接口检查失败时命令失败，但不会自动回滚已经完成的发布。

sleepy 必须读取正式博客目录中的清单，不能指向旧副本或某次发布的归档目录：

```sh
SLEEPY_ARTICLE_MANIFEST=/var/www/blog/community/comment-manifest.json pm2 restart sleepy-server --interpreter /var/sleepy/venv/bin/python --update-env
pm2 save
```

这是服务器首次配置/恢复时使用的命令；日常发布文章不需要重启 sleepy。后端根据清单文件变化自动重新加载。博客发布和回滚切换正式目录时，清单一起切换；评论数据库不受影响。

生产验证地址默认为 `https://blog.tonks.top/`，可通过部署配置 `publicUrl` 或环境变量 `DEPLOY_PUBLIC_URL` 覆盖。迁移博客目录时需同时更新 sleepy 的清单路径。
