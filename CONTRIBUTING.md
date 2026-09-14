# 贡献指南

## Fork 与分支

`origin` 指向你的 fork；`upstream` 指向贡献目标。先用 `git remote -v` 核对。仅在没有 upstream 时添加：

```powershell
git remote add upstream https://github.com/DrTonks/tonks-blog.git
git fetch upstream
```

开始新贡献时，从最新上游 main 建分支（工作区应干净）：

```powershell
git switch -c cleanup/my-change upstream/main
```

本次已经创建 `codex/remove-legacy-features`，继续使用它，不需要再执行上面的建分支命令。

## 检查、提交和推送

```powershell
git status --short
git diff --stat
git diff
pnpm build
pnpm test:production
git diff --check
```

本次代码删除可用 `git add -u` 暂存，但这会包含所有已跟踪文件的改动，务必先看清 diff。新增文档需单独添加：

```powershell
git add -u
git add CONTRIBUTING.md docs
git diff --cached --stat
git diff --cached
git commit -m "refactor: 清理旧评论与闲置组件并重写项目文档"
git push -u origin codex/remove-legacy-features
```

截图可在同一分支补充提交；后续 `git push` 会自动更新同一个 PR。不要把本地 `.env`、服务器登录信息、依赖目录或 `dist/` 加入提交，也不要运行 `pnpm ship`。
