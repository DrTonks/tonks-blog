---
title: AGENT(二) · 如何处理缓存命中率
published: 2026-05-16
description: 开发“微光职引”时遇到的问题分享；Context Engineering初步学习
tags:
  - 学习笔记
  - 问题探讨
  - 踩坑避雷
category: 学无止境
draft: false
pinned: false
image: ./cover.png
---
最近遇到了一个问题，千问大模型的输入输出的缓存价格不一样；这对我们的智能体开发来说是个需要解决的问题：如何提高缓存命中率以减轻我们的开发成本？
## Prefix Cache

缓存的命中率与大模型本身推理（KV Cache）还有API方面的服务设计（如Prompt Caching）有关；
Prompt Caching 是“跨 API 请求”判断已有前缀计算能否复用KV Cache的机制；KV Cache 是 Transformer 推理过程中保存和复用 Attention 的 K/V 计算状态。

从Agent本身出发，能做到的效果有限，但可以通过一些设计提高命中率。

更准确地说：**Agent 架构本身不会自动提高缓存命中率；而设计得好的 Agent 非常容易提高 Prompt Cache 命中率。**

大致的设计思路是把长期不变的东西放前面，把经常变化的东西放后面；已经发送过的前缀尽量不要修改；大块历史不要无限增长，而要适时压缩；而把什么内容给大模型“看”，是Agent要处理的问题，也就是Context Engineering的内容。

最朴素的Agent调用过程可以这么理解：

```
第 1 次：
[system]
[user]
→ LLM 决定调用 search()

第 2 次：
[system]
[user]
[assistant: call search()]
[tool: 搜索结果]
→ LLM 决定调用 read()

第 3 次：
[system]
[user]
[assistant: call search()]
[tool: 搜索结果]
[assistant: call read()]
[tool: 网页内容]
→ LLM 继续思考
```

由于agent通常是append-only的，可以抽象成以下的过程：

```
Request 1
[======= A =======]

Request 2
[======= A =======][ B ]
         ↑
       cached

Request 3
[======= A =======][ B ][ C ]
         ↑
       cached：后续append为A B C D E F G...
```

但是如果连续token被破坏：
```
旧：
A B C D E F G

新：
A B C X D E F G
      ↑
```

虽然后半段的“D E F G”仍然存在，但因为 prefix 已经断了，通常无法像之前那样直接复用整个连续前缀，也就是“没命中缓存”。所以缓存优化的核心是“从开头开始，有多少 token 连续一样”；理解了编译原理里的前缀匹配法，再去看这个会感觉比较亲切。
## Prompt怎么设计？

我们把极少变化的内容命名为COLD区，偶尔发生变化的为WARM区，热点则是HOT区；装填prompt的时候尽量以
$$
Cold \rightarrow Warm \rightarrow Hot
$$
这样的顺序，否则经常变化的热点会导致前缀缓存失效；

我们踩过的第一个坑是在系统提示词里加上时间。因为我们以为这样能让智能体动态地搜索最新的岗位列表（考虑到还有联网搜索模块）并进行分析；很遗憾，命中率几乎为0。惨痛的教训。

:::quote{author="动态System Prompt"}

[STATIC SYSTEM PROMPT]

现在时间：{{now}} （2026-04-06 14:30:01）

你是一个大学生职业规划助手，......

规则：
1. ...
2. ...
3. ...

工具使用规则：
...

安全规则：
...

:::

由于时间一直在变化，装填进的上下文的prefix不停被破坏，最终走的都是未命中流程。也就是说，上下文工程里的System prompt和Tool Definitions 都必须要稳定，防止token顺序变化伤害prefix cache。

:::quote{author="组员M"}
那么能不能动态载入工具定义呢，我每次只拿出agent要的那部分，避免污染上下文？
:::

我们没有在这方面做过太多的实验，这个取舍其实比较关键，动态载入工具定义能减少很多token，因为为了确保定义清晰和准确，我们在写作方面做了比较多文章，导致的结果是每次装填完整的工具定义；但是我们的工具是按模块分配的（比如学生画像、岗位画像、人岗匹配），所以在进入某个领域进行请求时，完全可以把其他模块的工具卸载。

**这引出一个问题：更短的prompt和更稳定的prompt该如何选择** ；

这恐怕没有绝对的答案，具体效果和回答质量要看使用的大模型；而价格不仅要看缓存命中率，还要看token的实际花费；这在之后需要重新实验和调研，我们当前只采纳了“全量装填”的做法，各个模块之间的关系还算比较紧密，因此即使是其他工具的定义加入到上下文，也不会对回答质量产生影响，甚至表现出来的更专业（仅在千问系列实验过）。

与SKill不同，虽然Skill也是在早期的元数据环节被写入系统提示词的，但是当 Agent 判断某个任务需要特定的 Skill 时，运行时才加载完整的 `SKILL.md`。比如Claude Code 会在调用位置把 Skill 指令作为 user message 加入会话；采用文件读取或专用激活工具的其他运行时，也可以把内容作为 tool result 返回。Tool调用环节，如果把所有专用代码工具的定义都放在系统提示词中，数量膨胀会消耗大量的 token，而且会干扰模型的注意力

## Compaction

之后进入到Agent Loop，显而易见的原则就是尽量 Append-only，不要帮用户整理上下文，而是直接填到后续。

Open ai的研究员在开发Codex的时候遇到了一个问题：AI大人的硅基注意力简直完爆了我们这些碳基虾米；为了让它能够高效自我迭代，他们开始把UI、日志和各种指标也加入到codex可读、可添加的上下文里。

:::quote{author="——Ryan Lopopolo"}
随着代码吞吐量的增加，我们的瓶颈变成了人工 QA 能力。由于人类的时间和注意力是固定的限制因素，我们一直在努力通过令应用程序的 UI、日志和应用指标等内容对 Codex 直接可读，从而为智能体增加更多功能。

例如，我们令应用程序可以根据 git worktree 启动，因此 Codex 可以为每次更改启动并驱动一个实例。我们还将 Chrome DevTools 协议接入智能体运行时，并创建了用于处理 DOM 快照、屏幕截图和导航的技能。这使 Codex 能够复现错误、验证修复，并直接推理 UI 的行为。
:::

但是我目前不讨论这个，对我们这种摸索着做agent产品的小白来说，另一个比较现实的问题是：上下文无限增长；我总想把所有的东西都暴露给AI，但是AI不一定吃得下（考虑到lost in the middle，太长的上下文也不一定是好事）；所以需要Compaction上下文压缩技术。

假设前面有各种乱七八糟的Search、Result、Search、Result，已经积累到150k tokens，很快就要突破模型上限了，我们可以通过算法（包括启用子agent）压缩历史上下文，也就是简单做个摘要总结成Goal、Findings、completed、Remaining这样的内容发给大模型，一轮中实测能被压缩到30k。

简单来说就是把A B C D E压缩成A SUM X。

所以这样设计不可避免的是 **Compaction 会破坏 Cache** ；压缩的时候缓存会有一次明显 reset。当然这是可接受的，总不能为了保持 cache而让 context 无限膨胀。

## 计算和监控

到这里，基本上就是agent能做的内容了；区别只在于压缩时如何压缩、提示词如何设计以及如何装填（也许还包括验证和约束什么的）；于是我们要开始设计命中率的监控。

我们会记录类似的指标
```
request_id
user_id
agent_run_id

input_tokens
cached_input_tokens
uncached_input_tokens
output_tokens

tool_calls
context_size
compaction_count

latency
time_to_first_token

model
cost
```

然后计算命中率：
$$
CacheHitRate = \frac{CachedInputTokens} {InputTokens}
$$


最后再观测每个实际的任务花了多少钱。具体思路要看后续的迭代方向。

附：虽然agent方面与kv关联没有很大，但是还是了解了一下大致的路线：

```
                      Agent
                        │
                        ▼
              结构化 messages
                        │
                        ▼
                 Chat Template
                        │
                        ▼
                    Tokenizer
                        │
                        ▼
              本次请求的 Token 序列
                        │
                        ▼
          ┌──── Prompt Cache 查找 ────┐
          │                           │
          │  前缀是否和之前请求一致？   │
          │                           │
          └──────────┬────────────────┘
                     │
              ┌──────┴──────┐
              │             │
            命中           未命中
              │             │
              ▼             ▼
       复用前缀的计算结果    Transformer
              │             重新计算
              │             │
              └──────┬──────┘
                     ▼
                  KV 状态
                     │
                     ▼
             继续处理剩余 Token
                     │
                     ▼
               逐 Token 生成
                     │
                     ▼
                  输出结果
```

[^1]: 不过其实有一些前沿的KV Cache相关的研究提出过对KV的编辑，我没有细究
