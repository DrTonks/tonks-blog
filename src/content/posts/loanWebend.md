---
title: 多数据源贷款及风控平台Web管理端设计思路
published: 2025-10-10
description: 综合设计1——Web管理后台
encrypted: false
pinned: false
tags:
  - 金融
  - 贷款
  - Vue3
  - JavaScript
  - 前端
category: 前端
---

> 暂不开源，仅上传需求分析文档和前端预览。

# Web 管理端需求分析文档

## 1. 总体描述

### 1.1 产品视角
管理端为内部运维/风控人员使用的后台系统。系统通过后端 REST API 获取用户、贷款产品与申请数据，呈现场景化的管理看板、审批工具与监控列表。前端通过 `useAxios` 统一封装请求并在拦截器中处理 token 过期等错误。

### 1.2 用户属性
- 管理员：登录后可查看统计数据、管理用户、管理贷款产品、审批贷款申请、查看还款监控并进行邮件提醒等操作。

### 1.3 运行环境
- 浏览器：现代桌面浏览器（Chrome / Edge / Firefox）
- 前端框架：Vue 3 + Element Plus
- 请求约定：所有需要鉴权的请求在 Header 中携带 `token` 字段（JWT）

## 2. 功能性需求

下列功能均为 Web 管理端必须实现的功能（编号以 FR- 开头）。

### FR-01 管理员登录
- 描述：管理员通过 `/admin-login` 接口登录。
- 输入：{ admin, password, autoLogin }
- 输出：{ code, msg, data(token) }
- 行为：登录成功后在 localStorage 中保存 token；路由守卫应在访问 /index 路由时检查 token，若无则跳转到 /login

### FR-02 用户管理（列表查看）
- 描述：显示用户列表（`/get-allUser`），支持检索、分页、筛选（实名、信息完整度）、多选与批量删除。
- API：GET `/get-allUser`
- 列表字段：userphone, realName, honesty_score, isVertification, basicInfo, detailInfo, total_application, in_payback_application
- 操作：查看详情（打开 `DetailDialog`，内部调用 `/get-basic` + `/get-detail` + `/userApplication`）、删除单个（DELETE `/delete_user`）、批量删除（多次调用 DELETE `/delete_user`）

### FR-03 用户详情查看
- 描述：在用户管理中点击“详情”打开对话框，展示基础信息与所有贷款记录。
- API：POST `/get-basic`、POST `/get-detail`、POST `/userApplication`、对每笔申请调用 POST `/user-loanInfo`
- 行为：详情页按 Tab 展现基本信息与贷款明细，贷款明细需根据每笔申请调用 `/user-loanInfo` 补充实际还款数组等字段

### FR-04 贷款产品管理（增删改查）
- 描述：展示贷款产品卡片列表（GET `/get-loan`），支持新增（PUT `/add-loan`）、编辑（PUT `/edit-loan`）与删除（DELETE `/delete_loan`）。
- 字段：loanProductId, loanProductName, isRelease, loanProductMaxMoney, AcceptScore, interestWays, tag

### FR-05 贷款申请审批列表
- 描述：展示全部申请（GET `/allApplication`），支持按状态筛选、检索与打开抽屉查看详情与审批操作。
- API：GET `/allApplication`；审批调用 POST `/approvalApplication`
- 行为：在抽屉（LoanDrawer）中展示申请详情（POST `/user-loanInfo`），若申请状态为待审批（status=2）展示批准/拒绝按钮，调用 `/approvalApplication` 提交 decision 与 comment

### FR-06 还款监控（贷中监控）
- 描述：展示所有已通过且还款中的申请（GET `/allPassedApplication`），计算并展示逾期期数、最长逾期等指标（前端基于返回的 payTime 与 actualPayBackTime 计算 overdueCount）
- API：GET `/allPassedApplication`；发送邮件提醒可模拟或调用未来后端接口（目前前端为 mock）
- 操作：查看详情、邮件提醒、跳转到用户详情或申请详情

### FR-07 仪表盘统计
- 描述：在首页显示统计数据和图表，统计数据来源通过并行获取：GET `/get-allUser`, GET `/get-loan`, GET `/allApplication`, GET `/allPassedApplication`
- 指标：用户总数、已实名用户数、贷款产品数、平均信用分、申请总数、在还款中数量、总放款金额、高风险贷款列表、最新申请列表

### FR-08 日志与错误处理
- 描述：全局 axios 拦截器需在 token 失效（code=4）或后端返回特殊错误时给予用户友好提示并重定向登录；页面内请求失败需以 ElementPlus 消息提示

## 3. 非功能性需求

### NFR-01 安全性
- 所有敏感操作需校验 token；若后端返回 code=4（未登录/过期），前端清除 token 并跳转登录

### NFR-02 性能
- 列表分页和筛选应在前端对已有数据进行过滤；当数据量非常大时建议后端支持分页查询以避免一次性拉取全部数据

### NFR-03 可用性
- 页面需对常见错误提供明确提示。删除、审批等危险操作需二次确认

### NFR-04 可维护性
- 前端通过 `useAxios` 统一封装请求与错误处理，便于后续扩展

## 4. 数据需求

说明：以下数据字段来自后端接口约定，前端需按下列字段进行展示与校验。

### 4.1 用户（users）
- userphone: String, 主键
- username: String
- realName: String
- userCardId: String
- isVertification: Boolean
- basicInfo: Boolean
- detailInfo: Boolean
- basic: { birthday, city, sex, email }
- detail: { marry, wealth, scholor, job, jobtime, salary, housing }
- honesty_score: Number
- total_application: Number
- in_payback_application: Number

### 4.2 贷款产品（loanProducts）
- loanProductId: Number
- loanProductName: String
- isRelease: Boolean
- loanProductMaxMoney: Number
- AcceptScore: Number
- interestWays: [{ time, rate }]
- tag: Array

### 4.3 贷款申请（loanApplications）
- application_id: Number
- userphone: String
- loanProductId: Number
- loanProductName: String
- loanAmount: Number
- time: Number
- rate: Number
- calcuInterestWay: Number
- payMoney: Array[String]
- payTime: Array[Number]
- actualPayBackTime: Array[Number | -1]
- status: Number
- risk_index: Number
- comment: String
- applyTime: Number

## 5. API 接口清单（管理端相关 & 公用）

以下接口均摘自项目根目录的接口文档，并结合前端源码中对 API 的实际调用列出。参数类型与响应结构以后端文档为准。

- POST /admin-login
  - 用途：管理员登录
  - 请求：{ admin, password, autoLogin }
  - 响应：{ code, msg, data(token) }

- GET /get-allUser
  - 用途：获取所有用户列表
  - 请求：无
  - 响应：{ code:1, msg: { users: [...] } }

- DELETE /delete_user?userphone=...
  - 用途：删除用户
  - 请求：query: userphone
  - 响应：{ code:1 }

- POST /get-basic
  - 用途：获取用户基础信息
  - 请求：{ userphone }
  - 响应：{ code:1, msg: { birthday, city, sex, email } }

- POST /get-detail
  - 用途：获取用户详细信息
  - 请求：{ userphone }
  - 响应：{ code:1, msg: { marry, wealth, scholor, job, jobtime, salary, housing } }

- GET /get-loan
  - 用途：获取全部贷款产品
  - 请求：无
  - 响应：{ code:1, msg: { products: [...] } }

- PUT /add-loan
  - 用途：新增贷款产品
  - 请求：loanProduct 对象
  - 响应：{ code:1 }

- PUT /edit-loan
  - 用途：编辑贷款产品
  - 请求：loanProduct 对象
  - 响应：{ code:1 }

- DELETE /delete_loan?loanProductId=...
  - 用途：删除贷款产品
  - 请求：query: loanProductId
  - 响应：{ code:1 }

- GET /allApplication
  - 用途：获取全部贷款申请
  - 请求：无
  - 响应：{ code:1, msg: { all_application: [...] } }

- GET /allPassedApplication
  - 用途：获取已通过并还款中的申请（用于还款监控）
  - 请求：无
  - 响应：{ code:1, msg: { all_application: [...] } }

- POST /user-loanInfo
  - 用途：获取单个申请详细信息
  - 请求：{ loanApplicationId }
  - 响应：{ code:1, msg: { application: {...} } }

- POST /userApplication
  - 用途：获取某用户所有贷款申请
  - 请求：{ userphone }
  - 响应：{ code:1, msg: { all_application: [...] } }

- POST /approvalApplication
  - 用途：管理员审批操作
  - 请求：{ decision, comment, application_id }
  - 响应：{ code:1 }

- POST /get-creditScore (只读)
  - 用途：获取用户信用分（管理端可调用用于展示或比对）

- 可能的内部/定时接口
  - POST /risk-pre-assessment：风控模型内部调用接口（后端在创建申请后调用）
  - 贷中风控任务（定时）：更新 loanApplications.risk_index

## 6. 主要用例

### UC-01 管理员登录并查看仪表盘
- 前置条件：管理员账号密码有效
- 正常场景：登录 → 跳转仪表盘 → 并行请求获取用户/产品/申请/已通过申请数据 → 渲染图表与统计卡片
- 异常场景：凭证无效或 token 过期 → 返回 code=4 → 强制登出并跳转登录

### UC-02 管理用户并查看详情
- 前置条件：管理员已登录
- 正常场景：进入用户管理 → 点击刷新 → 列表加载成功 → 点击详情 → 弹窗展示基础与详细信息与该用户的贷款记录
- 异常场景：后端返回错误 → 显示错误消息

### UC-03 审批贷款申请
- 前置条件：管理员已登录，存在 status=2 的申请
- 正常场景：进入申请列表 → 打开抽屉 → 查看详情 → 提交审批（decision + comment）→ 后端返回成功 → 前端刷新申请列表
- 异常场景：审批接口返回失败 → 提示错误

### UC-04 监控逾期并邮件提醒
- 前置条件：管理员已登录
- 正常场景：进入还款监控 → 列表展示逾期次数等指标 → 管理员点击邮件提醒（模拟或调用真实发送接口）→ 提示发送成功
- 异常场景：发送失败或用户没有邮箱 → 提示错误

## 7. 验收标准

- 所有页面在 token 失效时必须拦截并跳转登录（后端返回 code=4）
- 用户管理中能正确拉取 `/get-allUser` 并显示用户列表、筛选与分页功能
- 用户详情能正确显示 `/get-basic`、`/get-detail` 与 `/userApplication`（并随后调用 `/user-loanInfo`）数据
- 产品管理能正确展示 `/get-loan`，新增/编辑/删除分别能调用 `/add-loan`、`/edit-loan`、`/delete_loan` 并刷新列表
- 申请审批能正确调用 `/approvalApplication` 并刷新数据
- 还款监控能正确调用 `/allPassedApplication` 并由前端计算逾期期数
