---
title: 金融学基础 - 通用计算器
published: 2025-10-09
pinned: false
description: 覆盖贷款、投资分析与项目评估的教学工具，包含贷款还款、NPV/IRR、折旧、敏感性分析等功能。
tags:
  - 金融
  - 贷款
  - Vue3
  - TypeScript
  - 前端
category: 金融
draft: false
image: ./calculator.png
---

# 金融学基础 - 通用计算器

​	使用Vue3+Ts+Lodash计算库搭建的一个面向教学的金融计算工具，覆盖贷款计算与投资项目分析。当前功能包括贷款还款计划、提前还款模拟、年金/TVM 工具，同时扩展到 NPV/IRR、折旧、敏感性（蒙特卡洛）与会计盈亏平衡分析。

**在线预览（已部署）**

- 站点地址: https://loancalculator.tonks.top

**主要功能**

- 等额本息、等额本金 等常见贷款还款方式计算
- 提前还款（一次性或按期）计算并比较不同方案
- 租赁/租金相关计算器
- 通过 IRR 计算不规则现金流的真实利率（用于贷款与投资对比）
- 时间价值（TVM）年金与现值计算工具
- 结果以表格和图表（ECharts）展示，并支持币种切换等基础 UI

##### 高层实现思路

1. 前端路由：使用 `vue-router` 的 history 模式组织多页视图（注意：history 模式需要服务端配置回退到 `index.html`，否则刷新深层路由会 404）。
2. 计算层：把金融算法封装在 `lib` 中（例如 IRR、等额本息算法、提前还款分摊计算等），UI 组件只负责数据收集、校验、展示与调用引擎。
3. 表现层：使用 TailwindCSS + Element Plus 提供响应式布局与风格一致的表单控件，ECharts 展示还款曲线与现金流。

### 核心公式与示例实现

下面列出项目中使用的常见贷款公式与来自 `src/lib/loanEngine.js` 的简化实现示例，便于理解代码与验证结果。

1) **等额本息（每月固定还款 PMT）**

公式（年利率 i，月利率 r = i/12，贷款本金 P，期数 n）：
$$PMT = P\cdot \frac{r(1+r)^n}{(1+r)^n - 1}$$

函数 `pmtEqualPI`：

```javascript
function pmtEqualPI(P, r, n) {
  if (n <= 0) return 0
  if (r === 0) return P / n
  const t = Math.pow(1 + r, n)
  return (P * r * t) / (t - 1)
}
```

2) **由 PMT 反推本金（现值 PV）**

公式：
$$PV = PMT\cdot \frac{(1+r)^n - 1}{r(1+r)^n}$$

对应项目函数 `pvFromPMT`：

```javascript
function pvFromPMT(pmt, r, n) {
  if (n <= 0) return 0
  if (r === 0) return pmt * n
  const t = Math.pow(1 + r, n)
  return (pmt * (t - 1)) / (r * t)
}
```

3) **由本金与月供反推期数（n）**

如果已知本金 P、月利率 r 和月供 PMT，期数 n 的解析解：
$$n = \frac{\ln\left(\frac{PMT}{PMT - P\,r}\right)}{\ln(1+r)}$$

对应函数 `nperFromPMT` 在边界情况做了保护。

4) **由本金、期数、月供反推利率（r）**

利率没有显式解析解，项目中使用二分法在区间内求根（函数 `rateFromPMT`）。这是常见做法，能在足够宽的区间内快速收敛。

5) **生成还款计划（样例：等额本息）**

主要步骤：
- 计算每月还款 pmt
- 循环 n 次，计算当期利息 = 剩余本金 * r，本金 = pmt - interest
- 最后一月修正因四舍五入导致的残差

代码示例（ `scheduleEqualPI` ）：

```javascript
function scheduleEqualPI({ principal, monthlyRate, months }) {
  const pmt = pmtEqualPI(principal, monthlyRate, months)
  const rows = []
  let remain = principal
  for (let i = 1; i <= months; i++) {
    const interest = Math.round(remain * monthlyRate * 100) / 100
    let principalPay = Math.round((pmt - interest) * 100) / 100
    if (i === months) principalPay = Math.round(remain * 100) / 100
    const payment = Math.round((principalPay + interest) * 100) / 100
    remain = Math.round((remain - principalPay) * 100) / 100
    rows.push({ period: i, payment, principal: principalPay, interest, balance: Math.max(0, remain) })
  }
  return { method: 'EPI', pmt: Math.round(pmt * 100) / 100, rows }
}
```

6) **提前还款示例（一次性部分本金）**

两种常见策略：
- 缩短期数（保持月供不变，提前还款后减少剩余期数）
- 降低月供（保持剩余期数不变，提前还款后重新计算较低月供）

项目函数 `applyLumpSumPrepayment(schedule, { monthIndex, amount, strategy })` 实现了这两种策略：先计算提前还款后剩余本金，再用对应方法重建后续还款计划并与已还部分拼接。

示例用法（控制台）：

```javascript
import { generateSchedule, applyLumpSumPrepayment } from './src/lib/loanEngine.js'

// 贷款 100000 元，年利率 4.8%，20 年（240 个月），等额本息
const sch = generateSchedule({ amount: 100000, annualRatePct: 4.8, months: 240, method: 'EPI' })

// 在第 24 月一次性提前还 20000，策略为缩短期数
const sch2 = applyLumpSumPrepayment(sch, { monthIndex: 24, amount: 20000, strategy: 'reduce-term' })

console.log(sch.pmt, sch.totalInterest)
console.log(sch2.pmt, sch2.totalInterest)
```

## 投资分析模块：

### 融资计划模块功能讲解（包含NPV计算）

#### 1) OCF 与 NCF 的定义与区别

- 经营性现金流（Operating Cash Flow, OCF）反映企业日常经营活动产生的现金净流入，不包含期初固定资产投入、期末营运资本回收等“非经营性”项目。

  公式（第 t 年）：

  $$OCF_t = (Rev_t - Var_t - Fixed - D_t)\,(1-\text{tax}) + D_t$$

  变量说明：
  - $Rev_t$: 当年销售收入（销量 × 单价）
  - $Var_t$: 当年变动成本（单位变动成本 × 销量）
  - $Fixed$: 固定成本（不含折旧）
  - $D_t$: 第 t 年折旧额
  - $\text{tax}$: 所得税率（如 0.25 表示 25%）

- 净现金流（Net Cash Flow, NCF）用于 NPV/IRR 计算，包含期初投资与期末回收：

  序列构造（项目寿命为 $T$ 年）：

  - $t=0$: $NCF_0 = -(\text{Cost} + \text{WorkingCapital})$（期初支出为负）
  - $t=1,\dots,T-1$: $NCF_t = OCF_t$
  - $t=T$: $NCF_T = OCF_T + \text{Salvage} + \text{WorkingCapital}$

  本项目当前实现采用“简化处理”：期末回收不考虑处置损益的税影响（即未对残值与账面价值差额计提所得税）。

#### 2) NPV 的含义、判据与写法示例

- 定义：净现值（Net Present Value, NPV）是在给定折现率 $r$ 下，把项目各期净现金流 $NCF_t$ 折现到 $t=0$ 的现值总和。

  $$NPV(r) = \sum_{t=0}^{T} \frac{NCF_t}{(1+r)^t}$$

- 决策含义：
  - 若 $NPV(r) > 0$，项目在折现率 $r$ 下创造了正的价值，通常“可接受”；
  - 若 $NPV(r) < 0$，则在折现率 $r$ 下不经济；
  - $NPV(r)$ 随 $r$ 增大而下降（其他条件不变）。

- 记号示例：“NPV(15%)”表示以 15% 为折现率计算得到的净现值。README 与 CSV 会在指标行中注明当前使用的折现率。

#### 3) IRR 的含义与和 NPV 的关系

- 定义：内部收益率（Internal Rate of Return, IRR）是使 NPV 为 0 的折现率：

  $$\sum_{t=0}^{T} \frac{NCF_t}{(1+r)^t} = 0 \quad \Rightarrow \quad r = IRR$$

- 判据要点：
  - 单一常规现金流（先负后正）下，若 $IRR > r_{\text{门槛}}$，可接受；
  - 与 NPV 的关系：在相同现金流下，$IRR$ 是 $NPV(r)$ 的“零点”，当 $r < IRR$ 时 $NPV(r) > 0$。

> 实现说明：项目中 IRR 采用二分法在区间内求根，可用于不规则现金流。

#### 4) 投资回收期（Payback Period）

- 本项目在 CSV 中提供“简单投资回收期（未折现）”：从 $t=1$ 开始累计正向现金流，达到并覆盖期初投入（$t=0$ 的绝对值）所需的年数，若在寿命内未收回则记为“NaN/未收回”。
- “折现回收期”待实现。

#### 5) 折旧方法：直线法与双倍余额递减法

- 直线法（Straight-line）：

  $$D = \frac{\text{Cost} - \text{Salvage}}{\text{Life}}$$

  各年折旧额相等、账面价值线性下降。折旧通过“税盾”效应影响 OCF（见 OCF 公式中的 $+D_t$）。

- 双倍余额递减法（Double-declining balance, DDB）：

  $$D_t = \frac{2}{\text{Life}}\times BV_{t-1}$$

  以双倍直线率乘以前一年的账面价值计提折旧，并在最后阶段保证账面价值不低于残值（必要时进行最后一年封顶调整）。DDB 使早期折旧额更大，从而更早形成税盾、提高前期 OCF；但总折旧额在整个寿命内仍受“成本-残值”约束。

> 实践提示：在投资评估中，选用不同折旧法会改变各期税负与 OCF 时点分布，进而影响 $NPV(r)$ 与 $IRR$。一般而言，前期更大的税盾（如 DDB）在给定 $r$ 下可能提高 $NPV$。

#### 结果展示与导出

- 表格“现金流明细”：按“万元”展示 EBIT、折旧、净利润、OCF、NCF（净现金流），单位跟随当前币种；
- 图表：
  - X 轴为 T0 到各年（Y1..YT），
  - OCF（柱状）与 NCF（折线）直观对比；
  - Tooltip 显示“万元”。
- CSV 导出：
  - UTF‑8 BOM，适配 Excel/Numbers；
  - 附加指标行：“NPV（@折现率%）”、“IRR（%）”、“投资回收期（年）”。

#### 默认值与示例

- 初始折旧方法默认“直线法（straight）”；
- 提供“PC1000 项目示例”和“大型项目示例（5 年期）”，支持一键载入、可在弹窗中微调参数后立即计算；


## 蒙特卡洛模拟（贷款坏账预测）

该模块用于演示如何使用蒙特卡洛方法预测贷款组合的信用风险，涵盖了从微观（单笔贷款）到宏观（组合损失）的建模过程。

### 核心知识点与实现

1. **伯努利分布 (Bernoulli Distribution)**
   - **应用**：模拟单笔贷款的违约事件。
   - **实现**：对每笔贷款生成一个 $[0, 1]$ 区间的随机数，若小于违约概率 $PD$，则判定为违约。

2. **二项分布 (Binomial Distribution)**
   - **应用**：描述同质贷款组合中违约贷款的总数量。
   - **实现**：在 $N$ 笔贷款中，违约总数 $X \sim B(N, PD)$。

3. **大数定律 (Law of Large Numbers)**
   - **应用**：保证模拟结果的稳定性。
   - **实现**：通过“大数定律收敛图”展示随着模拟次数 $M$ 的增加（如 1000 到 10000 次），样本均值（模拟平均损失）如何逐渐逼近理论期望值。

4. **中心极限定理 (Central Limit Theorem)**
   - **应用**：解释损失分布的形态。
   - **实现**：在“损失分布直方图”中叠加正态分布拟合曲线。当贷款笔数 $N$ 足够大且 $PD$ 不极端时，总损失分布近似正态分布。

5. **风险价值 (VaR, Value at Risk)**
   - **应用**：衡量极端情况下的最大损失。
   - **实现**：对 $M$ 次模拟的损失结果进行排序，取第 95% 和 99% 分位数的损失值，作为 $VaR_{95\%}$ 和 $VaR_{99\%}$。

### 功能特性

- **参数配置**：支持自定义贷款笔数、单笔金额、违约概率 (PD)、回收率 (RR) 及模拟轮数。
- **多维可视化**：
  - **损失分布图**：直方图 + 正态拟合曲线 + VaR 标记线。
  - **收敛图**：动态展示模拟均值的收敛过程。
  - **散点图**：直观展示随机模拟的离散结果。
  - **敏感性分析**：自动分析 $PD$ 变化对预期损失 (EL) 和 VaR 的非线性影响。