---
title: 课设开发(五) · 建立用户"指纹"库
published: 2025-11-11
description: 契合课程题目"多数据源融合"的要求，模拟在用户明确许可的情况下，收集用户终端设备信息以及使用习惯，建立用户"指纹"库，作为风控的重要基础数据来源。
tags:
  - Uniapp
  - 前端
  - 金融
  - 贷款
  - 学习
category: 课设开发
draft: false
---
为了契合多数据源融合，除了后端那套评分卡和审批模型，大概就是要整点防骗贷之类的方案，我们想到的是设备指纹——在用户明确授权的前提下，采集终端设备特征和使用习惯，建一个指纹库，作为风控的底层数据来源之一。

## 设备指纹是什么

设备指纹就是n维的向量，单个特征（比如设备标识、屏幕分辨率）辨识度低得很，叠十几个特征基本能锁定设备。

特征分两类：

设备特征
- 屏幕分辨率、像素密度
- 机型、系统版本
- WebView 版本
- 字体列表
- CPU 核心数、内存大小
- 时区、语言

行为特征
- 什么时间段用 App
- 常用哪个功能模块
- 操作习惯：点击频率、滑动速度
- 网络环境变化模式

## 设备信息采集

```javascript
// 获取系统信息
uni.getSystemInfo({
  success: (res) => {
    const deviceFingerprint = {
      platform: res.platform,
      model: res.model,
      system: res.system,
      version: res.version,
      screenWidth: res.screenWidth,
      screenHeight: res.screenHeight,
      pixelRatio: res.pixelRatio,
      language: res.language,
      brand: res.brand
    };
    this.saveFingerprint(deviceFingerprint);
  }
});
```

网络类型、电池、存储这些也不是隐私敏感项，可以让指纹更立体：

```javascript
// 获取更多设备特征
async function getAdvancedFingerprint() {
  const fingerprint = {};

  // 网络信息
  const network = await uni.getNetworkType();
  fingerprint.networkType = network.networkType;

  // 电池信息
  const battery = await uni.getBatteryInfo();
  fingerprint.batteryLevel = battery.level;

  // 存储信息
  const storage = await uni.getStorageInfo();
  fingerprint.storageSize = storage.currentSize;

  return fingerprint;
}
```

## 行为特征埋点

设备特征是现成的 API，行为特征就得自己埋了。一个简单的 tracker 类：

```javascript
// 用户行为追踪
class UserBehaviorTracker {
  constructor() {
    this.behaviorData = {
      loginTimes: [],
      featureUsage: {},
      operationHabits: {}
    };
  }

  // 记录功能使用
  trackFeatureUsage(featureName) {
    const now = new Date();
    if (!this.behaviorData.featureUsage[featureName]) {
      this.behaviorData.featureUsage[featureName] = [];
    }
    this.behaviorData.featureUsage[featureName].push(now);
  }

  // 记录操作习惯
  trackOperation(operationType, duration) {
    this.behaviorData.operationHabits[operationType] =
      this.behaviorData.operationHabits[operationType] || [];
    this.behaviorData.operationHabits[operationType].push(duration);
  }
}
```

`trackFeatureUsage` 记录某个功能被点开的时间点，`trackOperation` 记录一次操作的耗时。

## 合规性

设备指纹本身不碰隐私，但是依然要授权：

```javascript
// 必须添加用户授权
async function requestFingerprintPermission() {
  try {
    // 显示隐私政策说明
    const result = await uni.showModal({
      title: '数据收集说明',
      content: '为提供更好的服务，我们将收集设备特征信息用于安全风控，这些信息不会识别个人身份。',
      confirmText: '同意',
      cancelText: '拒绝'
    });

    if (result.confirm) {
      // 用户同意后开始收集
      this.startFingerprintCollection();
      // 保存用户授权记录
      uni.setStorageSync('fingerprint_agreed', true);
    }
  } catch (error) {
    console.error('获取授权失败:', error);
  }
}
```

`fingerprint_agreed` 这个标记要持久化

```javascript
// 数据加密传输
function encryptFingerprintData(data) {
  // 使用加密算法处理敏感数据
  const encrypted = {
    timestamp: Date.now(),
    data: JSON.stringify(data),
    signature: this.generateSignature(data)
  };
  return encrypted;
}

// 安全存储
function saveFingerprintLocally(data) {
  uni.setStorage({
    key: 'device_fingerprint',
    data: this.encryptFingerprintData(data),
    success: () => {
      console.log('指纹数据保存成功');
    }
  });
}
```

分批减轻网络压力；失败就把这一批塞回队列头部重试，避免网络抖动时丢数据：

```javascript
// 分批上传，减少网络压力
class FingerprintUploader {
  constructor() {
    this.batchSize = 10;
    this.uploadQueue = [];
  }

  addToUpload(data) {
    this.uploadQueue.push(data);
    if (this.uploadQueue.length >= this.batchSize) {
      this.uploadBatch();
    }
  }

  async uploadBatch() {
    const batch = this.uploadQueue.splice(0, this.batchSize);
    try {
      await uni.request({
        url: 'https://your-api.com/fingerprint',
        method: 'POST',
        data: {
          fingerprints: batch,
          deviceId: this.getDeviceId()
        }
      });
    } catch (error) {
      // 上传失败，重新加入队列
      this.uploadQueue.unshift(...batch);
    }
  }
}
```

## 几个还没想太清楚的点

平台差异化处理？指纹有效期、跟踪时长？弱验证仅限于贷款时还是全期？

```javascript
// 平台差异处理
function getPlatformSpecificInfo() {
  // #ifdef APP-PLUS
  return this.getAppDeviceInfo();
  // #endif

  // #ifdef H5
  return this.getH5DeviceInfo();
  // #endif

  // #ifdef MP-WEIXIN
  return this.getMiniProgramInfo();
  // #endif
}
```