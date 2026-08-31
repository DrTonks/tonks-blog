---
title: 主页开发日志(二) · 桌宠接入AI与工具调用
published: 2026-08-30
description: 给桌宠的状态机接入大语言模型的输出，同时让它具有类似Agent的工具调用能力
tags:
  - 后端
  - Flask
  - LLM
  - Agent
  - Tool-calling
category: 网站开发
image: ./cover.png
draft: true
pinned: false
---

> 写作提示：本文只保留技术大纲。`[补充]` 处填写设计动机、开发过程、踩坑记录与个人感受。

## 一、从“会动的桌宠”到“会记住、会回应的角色”

- [补充] 接入 AI 前的桌宠能力与交互边界
- [补充] 为什么不做一个无限制的自由聊天框
- 本次目标
  - 两套桌宠共用同一套问答协议
  - 保留各自独立的人设与本地台词
  - AI 不可用时仍能完成交互
  - 只在确有需要时调用搜索工具

## 二、整体架构与职责划分

```text
DesktopPet / Live2DPet
  -> usePetQuestions：问题调度、频控、记忆
  -> usePetQuestionResponder：上下文组装、AI/本地回退
  -> src/api/petAi.ts：SSE 客户端
  -> Sleepy /pet/reply：校验、限流、模型调用
  -> PetAIService：提示词、人设、工具调用、输出清洗
```

- 前端：Vue 3、TypeScript、Pinia、Composable
- 后端：Flask Blueprint、Python 标准库 HTTP 客户端
- 模型协议：OpenAI-compatible Chat Completions
- 传输协议：Server-Sent Events（SSE）
- [配图] 前后端时序图

## 三、前端问题调度：不是每次点击都问 AI

### 3.1 数据驱动的问题配置

- `src/data/pet-questions.json`
- 问题字段
  - `id` / `kind` / `replyMode`
  - `schedule` / `condition`
  - `personas.static` / `personas.live2d`
  - `context_fields` 对应后端白名单
- [补充] 选取一个实际问题作为示例

### 3.2 频率控制与候选过滤

- `usePetQuestions.ts`
- 一次性记忆、自然日/自然周调度
- 全局提问冷却
- 城市、主题、音乐状态等运行条件
- 永久拒绝与动作结果记录

### 3.3 本地记忆的边界

- 浏览器本地保存用户称呼、回答与提问状态
- 发送给后端的上下文遵循“最少必要”原则
- [补充] 为什么没有把完整聊天历史交给模型

## 四、统一响应层：AI 与本地台词并存

### 4.1 三类回复模式

- `fixed`：完全本地回复
- `action`：主题切换、音乐播放等确定性动作
- `ai_with_fallback`：请求模型，失败时降级为本地台词

### 4.2 上下文组装

- `usePetQuestionResponder.ts`
- 可选字段
  - 上一次回答
  - 用户称呼
  - 城市
  - 天气描述与温度
- 不同问题只携带自身需要的字段

### 4.3 回退策略

- 网络异常、超时、模型错误统一回到本地台词
- 两套桌宠拥有不同的默认语气
- [补充] 一次真实降级案例与最终体验

## 五、SSE：让“思考中”和“搜索中”成为界面状态

### 5.1 前端协议

- `src/api/petAi.ts`
- `X-Client-ID`：匿名、稳定的浏览器标识
- 15 秒 `AbortController` 超时
- 事件类型

```json
{"type":"status","stage":"thinking"}
{"type":"status","stage":"searching"}
{"type":"result","reply":"..."}
{"type":"error","code":"..."}
```

### 5.2 流解析与错误归一化

- 按空行切分 SSE block
- `PetAIError` 统一网络、超时、空响应与服务端错误
- [代码片段候选] `parseSSEBlock` 或 `streamPetReply`

## 六、Sleepy 后端：一个无状态的桌宠回复接口

### 6.1 Flask Blueprint 与请求入口

- `pet_ai/__init__.py`
- `/pet/reply`
- 4 KB 请求体上限
- JSON 与 SSE 两种响应模式
- 服务实例缓存在 `current_app.extensions`

### 6.2 严格校验与最小上下文

- `pet_ai/validation.py`
- 只接受 `static` / `live2d`
- `question_id` 必须存在于服务端问题清单
- 逐字段长度限制、控制字符清理、温度范围校验
- 服务端根据问题配置过滤 `context_fields`

### 6.3 匿名限流

- IP 与 `X-Client-ID` 经盐值哈希后参与限流
- 分钟/IP 每日/全局每日/搜索每日四类额度
- [补充] 环境变量配置与线上取值

## 七、提示词拆分：安全、人设、输出规范

- `pet_ai/prompts/safety.md`
- `pet_ai/personas/static.md`
- `pet_ai/personas/live2d.md`
- `pet_ai/prompts/response.md`
- 每次请求重新读取提示词，便于线上调整
- 用户输入封装在 `<user_data>` 中并明确标记为不可信数据
- [补充] 两套人设的差异与调整过程

## 八、工具调用：只在需要核实作品信息时搜索

### 8.1 为什么限制搜索范围

- 仅允许服务端定义的 `web_search` 工具
- 禁止模型提供任意 URL 让后端抓取
- 固定访问 DuckDuckGo HTML 与 Bing RSS
- 查询、响应体、结果数量与超时均有限制

### 8.2 两条搜索触发路径

- 模型主动返回 tool call
- 提供商忽略工具但回答出现不确定语句时，服务端进行一次兜底搜索

### 8.3 搜索失败时不编造

- 搜索结果作为不可信片段重新交给模型
- 无可靠结果时返回保守的固定文案
- [代码片段候选] `PetAIService.events`

## 九、输出清洗与界面落地

- 去除角色名前缀、Markdown 包裹与多余追问
- 标点归一化与最大长度裁剪
- `thinking` / `searching` 映射到气泡状态
- 最终内容进入两套桌宠已有的气泡动画
- [配图] 两种桌宠在三个阶段下的界面

## 十、测试与故障注入

- SSE 分块解析测试
- 非法 `pet_id` / `question_id` / context 测试
- 模型超时与不可用时的本地回退
- 工具调用成功、搜索失败、提供商忽略工具三条路径
- 限流边界与匿名标识
- [补充] 实际遇到的故障及定位过程

## 十一、仍可继续改进的方向

- 流式输出正文，而不仅是流式状态
- 更细的成本、时延和成功率观测
- 提示词版本管理与离线评测集
- 将内存限流迁移到可共享存储
- 对工具调用增加来源质量评分
- [补充] 下一阶段取舍

## 十二、可附在文末的代码索引

- `tonks-home/src/composables/usePetQuestions.ts`
- `tonks-home/src/composables/usePetQuestionResponder.ts`
- `tonks-home/src/api/petAi.ts`
- `sleepy/pet_ai/__init__.py`
- `sleepy/pet_ai/validation.py`
- `sleepy/pet_ai/service.py`
- `sleepy/pet_ai/provider.py`
- `sleepy/pet_ai/search.py`
- `sleepy/pet_ai/rate_limit.py`
