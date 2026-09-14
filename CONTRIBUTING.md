# 贡献指南

## 借用电脑时的身份

Git 提交身份与 GitHub 登录是两回事。以下配置仅影响当前仓库，不使用 `--global`：

```powershell
cd D:\myserver\zhouyuan\zhouyuan-blog
git config --local user.name "你的 GitHub 用户名"
git config --local user.email "你的已验证邮箱或 GitHub noreply 邮箱"
git config --show-origin --get user.name
git config --show-origin --get user.email
```

推送认证应使用你自己的 GitHub 账号。不要覆盖或清除电脑主人的全局凭据；如浏览器或凭据管理器默认是主人的账号，停止推送并改用自己的登录会话。不要在命令、README 或提交里粘贴 Token。

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

## 在 GitHub 发起 PR

1. 用自己的 GitHub 账号打开你的 fork。
2. 点 **Contribute → Open pull request** 或 **Compare & pull request**。
3. 核对 base repository 是原仓库 `DrTonks/tonks-blog`、base 是 `main`；head repository 是你的 fork，compare 是贡献分支。
4. 浏览 Files changed，填写目的、删除范围、保留功能和验证结果。截图未补完时可以先建 Draft PR。
5. 创建后等待原维护者评审。PR 创建不代表已经合并，更不会自动部署。

需要获取上游更新时，先保证本地改动已提交，再 `git fetch upstream`，按维护者约定合并或变基；不熟悉冲突处理时不要使用 `reset --hard` 或强制推送。

本次 PR 建议标题：**清理旧评论与闲置页面组件，整理文档并补充界面截图**。正文应注明保留 sleepy 评论、图片优化及友链本地头像机制，并补上实际运行的验证结果。
