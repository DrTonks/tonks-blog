---
title: 贷款平台可视化数据大屏
published: 2025-10-23
pinned: false
description: 使用three.js与网上公开建模搭建的数据大屏，用于搭配Web管理端使用。
tags:
  - 数据可视化
  - 贷款
  - Vue3
  - TypeScript
  - Three.js
  - 前端
category: 前端
draft: false
image: ./dashboard.png
showCoverInContent: true
---

# 3D 可视化数据大屏

## 一、项目概述与预览

**在线预览（已部署）**

- 站点地址: https://loanriskctl-dashboard.tonks.top

技术栈：Vue 3（Vue CLI）、three.js、ECharts（局部图表）、axios（后端请求）、CSS2DRenderer（DOM 标签）、TWEEN.js（动画）。

## 二、实现流程

1. 准备资产
   - 把省份边界 GeoJSON（`public/map.json` 或 `public/newMap.json`）、ChinaLine.json、以及必要的图片资源放入 `public/`。

2. 基础框架
   - 使用 Vue CLI 建立项目骨架，按功能拆分视图与模块：`src/views/map_china.vue` 作为地图主视图，`src/initChinaMap` 负责 GeoJSON 加载与 three.js 模型构建，`src/views/prism` 负责棱柱效果，`src/components` 放图表组件。

3. three.js 场景搭建
   - 创建 `THREE.Scene`、`PerspectiveCamera`（或 Orthographic 根据需要）、`WebGLRenderer`、`CSS2DRenderer`（用于 DOM 标签），并集成到 Vue 生命周期（mounted/destroyed）。
   - 使用一个 `mapModel`（`THREE.Group`）作为地图根节点，所有省份网格、光效、粒子、棱柱、标签都挂在其下，方便统一管理与重加载。

4. 地图构建（GeoJSON -> Three.js）
   - 解析 GeoJSON 的 `features`，对每个 feature 通过投影（或直接坐标转换）构造 `THREE.Shape` -> `ShapeGeometry` -> `Mesh`，使用 `MeshStandardMaterial` 或 `MeshPhongMaterial`。
   - 将每个省份的 `properties.name` 绑定到对应的 `mesh.userData.name` 或 `object.parent.name`，并存储 `userData.center`（省的质心）用于放置标签/棱柱。
   - 将所有省份 mesh 加入 `mapModel`，然后把 `mapModel` 加到主场景。

5. 后端数据接入与省级聚合
   - 可用两种方式：
     a) 后端直接提供按省聚合的接口：例如 `GET /stats/province-overview` 返回每个省的指标（用户数、申请数、贷款均值、信用均值、通过率等）。
     b) 后端只提供原始用户/申请数据，前端并行拉取并合并（次优）：调用 `/get-allUser`、`/allApplication`、`/get-creditScore` 等，然后通过 `city -> province` 的映射函数（`src/utils/geoMatch.js` 与 `src/utils/cityToProvince.js`）把 city 字段解析为省名并聚合。
   - 实现要点：前端方法要做并发控制（例如 mapLimit）避免大量阻塞请求；但长期看应由后端做聚合以节省前端延迟与流量。

6. 可视化映射
   - 颜色映射（Heatmap）：根据某个指标（如人均贷款金额）计算每个省的归一化值，使用线性插值在蓝色/红色之间取色，并把颜色应用到省份材质或棱柱颜色。
   - 棱柱（Prism）：在省会/省中心位置放置 `THREE.CylinderGeometry` / `BoxGeometry`（或自定义棱柱），高度按值映射到一个区间（例如 3 到 40），顶部放 CSS2D 标签显示数值并带单位。
   - 粒子与波纹效果：利用 `THREE.Points`（带 BufferGeometry）或在材质上做渐变纹理；波纹可用 Shader 或在顶层添加 `Ring` mesh 并逐帧缩放透明度来模拟。

7. 交互与弹窗
   - 鼠标拾取（raycaster）：在 click 事件里做 `raycaster.intersectObjects(mapModel.children, true)` 找到省份 mesh，读取 `mesh.userData.name` 或 `feature.properties.name`，然后从 `provinceStats` 中取指标并填充 DOM 弹窗（使用 CSS2DRenderer 或普通 Vue 弹窗）。
   - 保护 HMR：在热重载或重复初始化场景时，使用 `mapModel.userData.__loaded`、`ensureAdd()` 等 guard 避免重复添加模型或重复绑定事件，防止内存泄露与视觉异常。

8. 性能与容错
   - GeoJSON 较大时（如包含很多 detail 的 map.json），构建成本高，考虑：
     - 压缩 GeoJSON（去除不必要的属性/精度）。
     - 懒加载细节图层（在缩放进入时再加载城市级别）。
     - 把大的静态资源放 CDN 或启用压缩/缓存（gzip、http cache headers）。
   - 数据层面：若后端不提供按省聚合，请移交后端增加接口，避免前端发出成千上万次请求。

---

## 三、实现要点总结

- 以 `mapModel` 作为地图根对象，便于 add/remove、热重载、安全判断（`__loaded`）。
- 省级匹配（city -> province）是数据正确性的关键：优先匹配省级词条，回退到 city->province 映射表，最后归为 unknown 并人工核查。
- Prism 的高度与颜色应基于归一化值（对数或线性），防止极端值压缩其他数据的可视差异。
- 事件绑定要具名并防止重复（绑定前检查标志），尤其在使用 HMR 的开发环境中。
- 把后端聚合放在服务器（REST 接口）是最佳实践，能显著降低前端请求量与延迟。

---

## 四、three.js 关键技术细节与实现说明

1. 场景与渲染器
   - 使用 `THREE.WebGLRenderer` 渲染 3D 内容。为 DOM 标签使用 `THREE.CSS2DRenderer`，并在每帧同步其位置（`labelRenderer.render(scene, camera)`）。
   - 在移动设备或低性能设备上考虑降低像素比：`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`。

2. 投影与坐标转换
   - GeoJSON 通常为经纬度，需要将（lon, lat）转换为二维屏幕坐标或三维地表坐标。常用做法：把经纬度转换为墨卡托或平面投影后缩放映射到场景坐标系。也可在 `public` 里准备每个省的 `userData.center` 作为已转换的三维坐标（减少重复计算）。

3. Geometry 构建
   - 解析 `feature.geometry.coordinates`，构造 `THREE.Shape`，然后 `new THREE.ShapeGeometry(shape)` 得到网格。对带孔（holes）的多边形需先处理 holes。
   - 使用 BufferGeometry 可以显著提高性能（使用 `THREE.BufferGeometry` 并尽量减少 draw calls）。

4. 材质与灯光
   - 选择 `MeshStandardMaterial` 或 `MeshPhongMaterial` 来获得更好的高光/漫反射效果。对大型地图，尽量重用材质实例或基于 `InstancedMesh` 来减少开销。
   - 添加环境光 `AmbientLight` + 方向光 `DirectionalLight`。如果需要阴影，注意阴影会额外影响性能。

5. Label（文字）与 DOM 结合
   - CSS2DRenderer 用于在 3D 场景上固定 DOM 标签（例如省名/数值），文本样式由 CSS 控制，方便响应式与交互。
   - 当标签很多时，考虑只显示 top N 或在缩放级别控制显示。

6. 动画与过渡
   - 使用 `TWEEN.js` 或 `gsap` 做平滑过渡（例如 prism 高度变化、弹窗淡入、右侧面板淡入）。
   - 在渲染循环里以 `requestAnimationFrame` 更新动画并渲染两个 renderer（WebGL 与 CSS2D）。

7. 效果（Prism/Particles/Ripple）实现技巧
   - Prism：可以用 `THREE.CylinderGeometry` 或 `BoxGeometry`，并通过 `mesh.scale.y` 或调整几何体的高度来表示数值。
   - Particles：用 `THREE.BufferGeometry` + `THREE.PointsMaterial`，使用顶点属性（position、size、color）并在 shader 里做额外效果。
   - Ripple：用多层 `RingGeometry`，在每帧按比例缩放并降低透明度；或写一个简单的 shader 根据时间生成扩散波纹。

8. 性能优化（要点）
   - 合并静态 geometry（例如把多个小标注合并成一个 `BufferGeometry`）。
   - 对重复使用的对象使用 `InstancedMesh`。
   - 使用 LOD（Level of Detail）分层渲染，缩放时切换到更少 detail 的模型。
   - 对大的静态 JSON（如 ChinaLine.json、map.json）使用 gzip、CDN 或按需加载。