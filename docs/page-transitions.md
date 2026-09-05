# 页面过渡对照与本地适配

参考：LeeHero0803/leehenry-blog 当前 main；2026-09-05 再次读取配置、Layout、SideBar、transition 样式。以下时长为源码配置。

| 机制 | 参考项目 | 本站采用的处理 |
| --- | --- | --- |
| DOM 替换 | Swup 替换 main 和 sidebar | 仅替换 main，侧栏节点及用户折叠状态保留 |
| 侧栏 | 以 data-widget-key 识别已有组件，取消其重复入场；无 AI 摘要交接 | 相同头像保持；头像/摘要主组件并行退场200ms，替换期间保持透明，随后局部入场300ms |
| 页面动画 | 外层200ms/1rem；组件300ms/2rem，分层延迟0至325ms | 外层200ms；内容使用CSS 300ms渐进入场，移除额外JS逐节点动画 |
| Banner | visit:start立即改变布局，同时700ms过渡 | 恢复原有700ms连续布局过渡，visit:start同步启动；移除固定裁切、正文translate补偿和替换时位置重置 |
| 滚动 | 默认平滑滚动，临时300vh高度 | 统一原生平滑滚动，用户输入可中断；目标DOM替换后恢复，避免短旧页截断长文历史位置；减少动态效果偏好下即时定位 |

## 本地闪烁根因

Swup 顺序为替换内容、恢复滚动、page:view、下一帧、animation:in:start。若替换时即显示新摘要，入场事件才令它从透明开始，就会先显示一帧再隐去。主组件必须在替换前完成退场，并保持透明跨过这一阶段。

主组件退场与正文并行，不增加一次额外等待；其余侧栏组件不淡出。相比照搬整栏替换，这保留了展开状态和交互节点。普通页面间相同头像无需重播。动画不会参与历史恢复的Y位置计算。

## 可继续改善的方向

- 用稳定组件标识而非整栏状态驱动动画；后续新增头像变体可扩展同一交接协议。
- 慢网下保留清楚的即时反馈，避免把网络等待伪装成延长的退场动画。
- 以真实帧、快速连续导航、触屏和减少动态效果偏好验证，而不是仅凭CSS时长判断流畅。

## 源码

- https://github.com/LeeHero0803/leehenry-blog/blob/main/astro.config.mjs
- https://github.com/LeeHero0803/leehenry-blog/blob/main/src/layouts/Layout.astro
- https://github.com/LeeHero0803/leehenry-blog/blob/main/src/components/widget/SideBar.astro
- https://github.com/LeeHero0803/leehenry-blog/blob/main/src/styles/transition.css


## Phase84 清理与验证

移除早前瞬时滚动及几何补偿方案，保持一个导航生命周期。AI摘要预留全文高度，逐字显示只更新覆盖文本；重复摘要在取消打字后补全。主题扩散期间保持导航栏模糊，并以足够优先级禁用背景渐变，避免两种过渡叠加。菜单增加透明的鼠标通道。

Edge实际渲染验证：短页返回长文5000px准确；摘要17/20字至108字时高度180.25px不变；主题切换blur20px不变、背景一次切换；320/390/1440px无横向溢出；Banner从350至650px连续展开。生产构建42页成功，媒体测试5/5；Astro检查仍有既有52项错误。子agent复核两项导航边界修复，无新增明确阻断问题。

## 最终交互调整

按新的阅读偏好，AI摘要取消全文高度占位，初始仅保留一行高度并随打字逐行增长。主题导航表面改由快照生命周期临时冻结transition，结束前结算目标样式并恢复，统一移动壁纸动态透明模式亮暗值。侧栏文本名字恢复早期版本。
