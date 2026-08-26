---
title: 使用Github Action部署网站的常见问题
published: 2024-09-21
description: 初步使用GitHub工作流部署网站可能遭遇的问题
tags:
  - Markdown
  - Github
  - npm
  - pnpm
category: 常见问题
draft: false
---

说是常见问题，其实只有一个。**在2020年，GitHub 开始将默认主分支的名称从 master 更改为 main。** 对于某些功能，这两者似乎能够自动识别替换，但在手写的yml文件中，出现master将导致Github Action无法正常识别其作用的分支，不能自动将其部署在指定域名。

​	另外，在部署博客的过程中，我尝试了pnpm（一种快速且节省磁盘空间的软件包管理程序，相当于npm的替代），并通过如下指令安装：

```cmd
npm install -g pnpm
```

​	即使我已经设置了-g 全局环境配置，在运行pnpm命令时仍然提示：

```cmd
pnpm : File 
C:\~\pnpm.ps1 cannot be loaded because running s
cripts is disabled on this system. For more information, see about_Execution_Policies at https:/go.microsoft.com/fwlink
/?LinkID=135170.
At line:1 char:1
+ pnpm add -D vitepress
+ ~~~~
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess
```

​	这个错误是由于PowerShell阻止了脚本运行。

​	解决思路：在当前用户的作用域下更改执行策略，而且并不需要以管理员身份运行。

```cmd
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

​	最后我放弃使用Github Action来托管该页面，考虑到GitHub Actions的服务器在国外，国内访问可能较慢，偶尔被墙；托管在GitHub Pages上的页面，国内用户访问速度慢，影响用户体验。
