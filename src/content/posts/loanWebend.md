---
title: 课设开发(二) · 多数据源贷款及风控平台管理端
published: 2025-10-10
description: 综合设计——Web管理后台
encrypted: false
pinned: false
tags:
  - 金融
  - 贷款
  - Vue3
  - JavaScript
  - 前端
category: 前端
draft: false
---

管理端面向内部运维/风控。

技术栈上使用 Vue 3 + Element Plus，请求统一用 `useAxios` 封装，需要鉴权的请求都在 Header 里带 `token`（JWT）。

## 鉴权

1. 登录成功把 `token` 存进 `localStorage`；路由守卫进 `/index` 前检查有没有，没有就踢回 `/login`。
2. 过期处理——`token` 可能中途过期。于是再在 axios 拦截器里兜一层：后端约定失效时返回 `code=4`，拦截器拿到就直接清 token，out login之后弹个提示。

## 用户管理

列表走 `GET /get-allUser`，检索、分页、筛选（实名 / 信息完整度）、多选、批量删除都在前端做。

这里有个小取舍：列表接口一次性把用户全拉回来，分页和筛选都在内存里做。课设的数据量就那点，前端过滤反而省事、交互也快；如果数据量过大再让后端加分页查询。

详情是弹窗 `DetailDialog`，点开才去拉三样：`/get-basic`（基础信息）、`/get-detail`（详细信息）、`/userApplication`（该用户的所有贷款申请）。而贷款明细里，每一笔还得再调一次 `/user-loanInfo` 补上实际还款数组——所以详情页是整个系统里请求最密集的一处。

删除单条走 `DELETE /delete_user?userphone=...`；批量删除本质就是循环调这个接口，后端没给批量接口，前端只能这么写。

## 贷款产品管理

标准的增删改查。卡片列表走 `GET /get-loan`，新增/编辑走 PUT `/add-loan`、`/edit-loan`，删除走 `DELETE /delete_loan`。

大致字段：产品名、是否上架、额度上限、接受的信用分 `AcceptScore`、计息方式、标签

## 申请审批

列表走 `GET /allApplication`，按状态筛、检索。点开是抽屉 `LoanDrawer`，里面调 `/user-loanInfo` 拿详情。

判断逻辑卡在状态上：`status=2` 表示「待审批」，只有这时才渲染批准/拒绝两个按钮，走 `POST /approvalApplication`，提交 `decision` 和 `comment`。

## 还款监控（贷中）

`GET /allPassedApplication` 返回所有已通过且还款中的申请，用 `payTime`（应还时间）和 `actualPayBackTime`（实还时间）自己算出逾期期数和最长逾期。

邮件提醒目前是 mock。不太好搞，因为国家政策有要求不能骚扰借贷人，而且我们发的邮件大概率也进的是垃圾桶，不如打电话，当然这就是贷后的事情了。

### 仪表盘

首页有四个接口展示数据：`/get-allUser`、`/get-loan`、`/allApplication`、`/allPassedApplication`，然后前端拼出用户总数、已实名数、产品数、平均信用分、申请总数、在还款中数量、总放款金额，再配高风险贷款列表和最新申请列表。

## 设计接口

管理端可能会用到（以及后端内部/定时、前端不直接调的）接口：

- POST `/admin-login` —— 登录，入 `{admin,password,autoLogin}`，出 `token`
- GET `/get-allUser` —— 用户列表
- DELETE `/delete_user?userphone=...` —— 删用户
- POST `/get-basic` / POST `/get-detail` —— 用户基础 / 详细信息
- GET `/get-loan`、PUT `/add-loan`、PUT `/edit-loan`、DELETE `/delete_loan?loanProductId=...` —— 产品增删改查
- GET `/allApplication` —— 全部申请
- GET `/allPassedApplication` —— 已通过且还款中的申请
- POST `/user-loanInfo` —— 单个申请详情
- POST `/userApplication` —— 某用户所有申请
- POST `/approvalApplication` —— 审批，入 `{decision,comment,application_id}`
- POST `/get-creditScore`（只读）—— 用户信用分
- POST `/risk-pre-assessment` + 贷中定时任务 —— 后端在创建申请后调用，定时刷 `loanApplications.risk_index`，前端不直接碰
