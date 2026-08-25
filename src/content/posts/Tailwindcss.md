---
title: Tailwind CSS初步学习
published: 2025-10-10
description: tailwindcss学习笔记1
image: ""
tags:
  - Tailwind
  - CSS
  - 前端
  - 学习
category: 前端
draft: false
lang: ""
---

# Tailwind CSS 初步学习

## 什么是 Tailwind CSS

Tailwind CSS 是一个功能优先的前端CSS框架，通过提供低级别的工具类来快速构建自定义设计。
它回归了传统的行内样式的编写，这导致了一些问题，比如大幅降低了代码的可读性和复用性（尽管Tailwind CSS提供了一系列工具来解决这个问题，但是在类名属性里写@apply的方法无疑是封装再封装、套娃再套娃的下下策。）
但是Tailwind CSS的学习是前端工作必不可少的一部分，因为~~写起来真的很爽~~ 现在AI Agent辅助工具横行（github copilot、cursor、Claude code......），这个样式库开发工具无疑是强大、便利的，也因此被大量的组件库收录和使用，这导致为了读懂和编辑某些组件库的代码，Tailwind CSS本身的学习需要被提上日程。

**特点：**

- 实用工具优先
- 高度可定制
- 响应式设计
- 无预设样式

## 核心概念

### 1. 实用工具优先

每个类都对应一个特定的 CSS 属性，通过组合类名来构建界面。

```html
<!-- 传统 CSS -->
<div class="card"></div>

<!-- Tailwind CSS -->
<div class="bg-white rounded-lg shadow-md p-6"></div>
```



### 2. 响应式设计

使用前缀来定义不同屏幕尺寸的样式。

```html
<div class="w-full md:w-1/2 lg:w-1/3"></div>
```



## 常用工具类

### 布局 (Layout)

```html
<div class="flex justify-center items-center">
  <div class="w-1/2 p-4 m-4"></div>
</div>
```



### 间距 (Spacing)

- `m-4` - 外边距 1rem
- `p-4` - 内边距 1rem
- `mt-2` - 上外边距 0.5rem
- `px-4` - 水平内边距 1rem

### 颜色 (Colors)

```html
<div class="bg-blue-500 text-white border border-gray-300"></div>
```



### 排版 (Typography)

```html
<h1 class="text-3xl font-bold text-gray-800 text-center"></h1>
<p class="text-base text-gray-600 leading-relaxed"></p>
```



### 边框 (Borders)

```html
<div class="border border-gray-300 rounded-lg shadow-sm"></div>
```



### 背景 (Background)

```html
<div class="bg-gradient-to-r from-blue-400 to-purple-500"></div>
```



## 响应式设计

### 断点前缀

- `sm:` - 640px+
- `md:` - 768px+
- `lg:` - 1024px+
- `xl:` - 1280px+
- `2xl:` - 1536px+

```html
<div class="w-full md:w-1/2 lg:w-1/4"></div>
<div class="text-sm md:text-base lg:text-lg"></div>
```



## 状态变体

### 交互状态

```html
<button class="bg-blue-500 hover:bg-blue-700 focus:ring-2 focus:ring-blue-300">
  点击我
</button>
```



### 表单状态

```html
<input class="border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
```



### 其他状态

```html
<div class="group hover:bg-gray-100">
  <p class="text-gray-600 group-hover:text-gray-900"></p>
</div>
```



## 自定义配置

### 扩展主题

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'brand': {
          100: '#f7fafc',
          500: '#667eea',
          900: '#1a202c',
        }
      },
      spacing: {
        '72': '18rem',
        '84': '21rem',
      }
    },
  },
}
```



### 自定义工具类

```css
@layer utilities {
  .scroll-snap-none {
    scroll-snap-type: none;
  }
  .scroll-snap-x {
    scroll-snap-type: x mandatory;
  }
}
```



## 最佳实践

### 1. 组件提取

对于重复使用的样式组合，提取为组件：

```html
<!-- 提取前 -->
<button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
  按钮
</button>

<!-- 提取后使用 @apply -->
<button class="btn-primary">
  按钮
</button>

<style>
.btn-primary {
  @apply bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded;
}
</style>
```



### 2. 使用 PurgeCSS

生产环境优化，移除未使用的 CSS：

```javascript
// tailwind.config.js
module.exports = {
  purge: [
    './src/**/*.html',
    './src/**/*.vue',
    './src/**/*.jsx',
  ],
}
```



### 3. 保持可维护性

- 避免过长的类名列表
- 使用有意义的组件名称
- 合理使用 `@layer` 指令

### 4. 性能优化技巧

```javascript
// 只启用需要的功能
module.exports = {
  corePlugins: {
    float: false,
    clear: false,
  }
}
```



## 实用技巧

### 任意值

使用方括号添加任意值：

```html
<div class="top-[117px] w-[200px] bg-[#bada55]"></div>
```



### 深色模式

```html
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"></div>
```

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class', // 或 'media'
}
```

当前博客的主题切换缺乏了一些过渡，然而不使用GASP的情况下实现丝滑切换比较困难，Element+的模式也有一定的缺陷，难以解决。

------

