---
title: 多数据源贷款及风控平台后端模型设计思路
published: 2025-10-08
description: "综合设计1——评分卡/审批模型设计"
encrypted: false
pinned: false
tags: [金融, 贷款,Express,JavaScript,node.js]
category: "后端"

---

# 后端模型设计

1) 评分卡（scorecard）——对“用户”长期信用的评分（honesty_score）
2) 申请审批模型（applicationApproval）——对“单笔贷款申请”的风险评估（riskScore / suggestion）

---

## 一、评分卡（services/scorecard.js）

目的：对每个用户计算一个稳定的信用分（honesty_score），范围映射到 [300, 850]。用于长期行为和资料的度量，其他模块（例如申请审批）可以读取并作为特征。

核心实现步骤（见 `services/scorecard.js`）：
- 计算若干 "buckets"（子项），每个子项给出 points（正/负分）。
- 求和得到 rawPoints，然后把 rawPoints 线性映射到 [300,850]。

关键子项与评分逻辑：
- isVertification（实名认证）：如果为真，points += 50
- basicInfo（基础资料完整）：如果为真，points += 30
- detailInfo（详细资料完整）：如果为真，points += 30
- salary（来自 detail.salary）：
  - >= 5000 -> +60
  - >= 3000 -> +30
  - >0 -> +0
  - 缺失 -> +10（不惩罚太重）
- wealth（存款，detail.wealth）:
  - >=50 -> +50
  - >=20 -> +30
  - 否则 -> +0
- jobtime（在职时长）：
  - >=5 -> +40
  - >=3 -> +20
  - >0 -> +5
  - 否则 -> +0
- marriage（marry === 1 -> +20）
- totalApplied（历史申请数 >=5 -> -20）
- outstanding（当前进行中贷款数） -> 每笔 -5
- lateCount（逾期次数） -> 每次 -20
- maxLateDays (>30) -> -30

rawPoints 约在 [-200, +400]（实现中指定了默认映射区间），最后通过 mapRawToScore 把 rawPoints 线性映射到 [300,850]：

score = round( MIN_SCORE + (clippedRaw - minRaw) / (maxRaw - minRaw) * (MAX_SCORE - MIN_SCORE) )

其中 minRaw=-200, maxRaw=400（可在代码中调整）。

可调参数与修改点：
- 各子项的 points（例如实名认证从50调整为40）直接在 `services/scorecard.js` 中修改对应分配即可。
- raw->score 的映射区间（minRaw, maxRaw）决定了分布的压缩/拉伸，可调整以适配实际分布。
- 若要引入更多特征（例如用户行为信号），把新特征加入 buckets 并在 raw 中加权。

调优建议：
- 收集历史用户的真实违约/审批结果，按分箱统计每个分段的违约率，从而调整各 bucket 的权重与映射区间。
- 可逐步引入统计/回归/树模型来拟合 rawPoints 的权重分配。

批量重算与运行健壮性
- 项目提供 `jobs/recalculateScores.js` 用于批量重算 `honesty_score` 与 `risk_index`。该脚本支持分页处理以避免一次性全量加载。
- 新增重试机制（`--retries` / `--retryDelay`）以及失败记录（`jobs/recalculateFailures.log`），以便在遇到短暂 DB/网络故障时自动重试并在持续失败时记录待人工排查的数据点。

在将评分逻辑迁移到生产环境或更高并发场景时，建议把脚本改为基于主键游标的分页并引入任务队列以避免并发写冲突。

---

## 二、申请审批模型（services/applicationApproval.js）

目的：对单笔贷款申请打分并给出初步建议（APPROVE / REJECT / MANUAL_REVIEW）。该模型应当更保守并侧重于本次申请的短期风险。它会使用用户长期信用分（honesty_score）作为重要特征，同时关注申请金额与产品上限比例、资料完整度、计息方式等。

输出合同：
- 返回对象：{ riskScore: number (0-100), suggestion: 'APPROVE'|'REJECT'|'MANUAL_REVIEW', factors: string[] }

实现概述（当前实现规则化方法）：
1. 特征映射函数：
   - mapHonestyToRisk(honesty_score)：将 honesty_score（300-850）反向映射到 0-100 的风险分（850 -> 0, 300 -> 100）
     - formula: (850 - clipped) / 550 * 100
     - 缺失时使用保守默认 80
   - mapAmountRatio(amount, maxMoney)：基于申请金额与产品上限的比值返回 0-90 的分数
     - ratio <= 0.1 -> 0
     - ratio <= 0.5 -> 30
     - ratio <= 1 -> 60
     - ratio > 1 -> 90
     - 若 maxMoney 缺失：使用按 amount 阈值的保守估计（<1000->20, <5000->40, else->70）
2. completenessPenalty（资料完整度惩罚）：
   - 未实名认证 +20, 缺基础 +10, 缺详细 +15
3. calcuInterestWay（计息方式）影响：
   - calcuInterestWay === 1 时加小惩罚 calcuPenalty=5（代表等额本金前期压力）
4. productAccept（产品设定的 AcceptScore）直接参与，取值 0-100（若不存在，默认50）

加权合成（当前权重）：
- userRisk * 0.4
- amountRatioScore * 0.3
- completenessPenalty * 0.15
- calcuPenalty * 0.05
- productAccept * 0.1

raw = sum(上面各项)
riskScore = round(raw) -> 截断到 [0,100]

建议阈值（当前实现）：
- riskScore <= 40 -> APPROVE
- riskScore >= 70 -> REJECT
- 否则 -> MANUAL_REVIEW

factors：根据触发条件返回一组字符串标签，用于人工审核界面显示和后续数据标注。

可调参数与如何调整（工程指南）：
- 各权重（0.4,0.3,0.15,0.05,0.1）在 `services/applicationApproval.js` 中直接修改。
- completenessPenalty 的分值（20、10、15）也在代码中修改。
- mapAmountRatio 的分段与阈值可根据产品特性调整（例如对小额速贷产品减小 amount 权重）。
- threshold（40/70）决定了系统偏向通过或拒绝，可上移或下移用于更保守或更激进的策略。

异常与缺失字段的处理策略：
- 对于缺失关键字段（例如 loanAmount），当前实现会把对应 factor 加入并用保守默认值（或直接走 MANUAL_REVIEW）。这是为避免自动放款带来风险。
- 评估函数应当保证不会抛出未捕获异常；上层调用可在评估异常时把申请标记为 MANUAL_REVIEW（见 `api/loan.js` 的实现）。

调优与迁移建议：
- 规则版优点：实现快、可解释、便于上线试运行并收集标注数据。
- 若后续积累了足够的“申请 + 管理员审批结果/实际逾期结果”数据，建议：
  1) 用规则版生成的 `factors` 与最终人工决定作为特征/标签，训练一个轻量的模型（例如梯度提升树 XGBoost/LightGBM）作为试验替代；
  2) 线下验证模型 AUC/PR，并用于替换或和规则版并行运行（shadow mode）；
  3) 最终决定逐步迁移到在线模型服务（模型可部署为独立 microservice，返回 riskScore）。

---

## 三、迁移为 ML？
1. 数据收集：保证每笔申请都保存输入特征、规则评估结果、人工审批决定、后续是否逾期等标签。
2. 特征工程：把 `factors`、用户历史统计、产品信息、时间特征等转换为模型特征。
3. 模型训练：从简单的树模型开始（LightGBM/XGBoost），进行交叉验证并评估 AUC/PR/Calibration。
4. 模型上线：先做 shadow 流量或 A/B 测试，然后逐步替代规则或作为辅助。
5. 监控：持续监控模型效果与数据分布漂移。

