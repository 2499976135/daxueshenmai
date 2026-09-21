# 开发文档 / DEVELOPMENT

本文面向开发者：如何本地运行、改代码、跑测试、打包发布。

> 普通用户请直接看 [README.md](README.md)。

---

## 项目简介

一个**纯本地运行**的倒计时 + 专注计时 + 学习统计应用。零外部依赖，图表用 Canvas 自绘，数据存在 localStorage。通过 Capacitor 打包成 Android 安装包。

---

## 本地运行

**方式一（最简单）**：直接双击 `www/index.html`，用浏览器打开。

**方式二（推荐，PWA 完整支持）**：起一个本地静态服务

```bash
cd countdown-app/www
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

**跑测试**（需 Node.js）：

```bash
node test/logic.test.js       # 逻辑单元测试（倒计时/计时器/存储/AI）
node test/check-assets.js     # 资源引用完整性校验（防 404）
# 或
npm test
```

---

## 目录结构（改哪里，看这张表）

```
countdown-app/
├── www/                    # 网页资源（本地运行与打包都在这里）
│   ├── index.html          # 页面骨架（各页面的 DOM 结构、底部导航、弹窗）
│   ├── css/style.css       # 全部样式 + 主题 CSS 变量（配色在这里改）
│   ├── js/
│   │   ├── store.js        # 数据层：localStorage 持久化 + 增删改查 API
│   │   ├── countdown.js    # 倒计时/正计时天数计算逻辑
│   │   ├── focus.js        # 正计时状态机（开始/暂停/继续/结束）
│   │   ├── charts.js       # 图表引擎（环形/柱形/折线，Canvas）
│   │   ├── ai.js           # AI 接口抽象层 + prompt 组装
│   │   └── app.js          # 主控制器：UI 渲染 + 事件绑定 + 模块串联
│   ├── manifest.json       # PWA 清单
│   └── icons/icon.svg      # 应用图标
├── android/                # Capacitor 生成的 Android 原生工程
├── test/                   # 逻辑测试 + 资源校验脚本
├── .github/workflows/      # GitHub Actions 自动构建 / 发布
├── capacitor.config.json   # Capacitor 打包配置
├── package.json            # 打包/测试脚本 + Capacitor 依赖
└── node_modules/           # npm 依赖（npm install 自动生成）
```

**设计原则**：每个文件单一职责，`store.js` 是唯一的数据入口，所有 UI 只通过 `Store` 读写数据。改倒计时逻辑只动 `countdown.js`，改配色只动 `style.css`，改数据字段只动 `store.js`。

---

## 功能说明

| 模块 | 能力 |
| --- | --- |
| 倒计时 | 纪念日 / 生日 / 考试 / 节日，支持「每年重复」；点击条目进入沉浸式大屏倒计时，每条可自定义背景图片 |
| 正计时专注 | 自建科目/专注项（自定义名称、目标时长、颜色），开始/暂停/结束专注会话；删除科目时可选择保留历史记录；番茄钟提醒，每日目标进度环 |
| 统计图表 | 扇形图（日 / 周 / 月范围切换）、柱形图（近 7 天）、折线图（近 30 天趋势） |
| AI 分析 | OpenAI 兼容接口（DeepSeek / OpenAI / Ollama / 自定义） |
| 其他 | 深色 / 浅色 / 跟随系统主题，数据导出导入，响应式布局 |

---

## 如何扩展（扩展指南）

### 1. 改配色 / 换主题
打开 `www/css/style.css`，顶部的 `:root`（浅色）和 `[data-theme="dark"]`（深色）里改 CSS 变量，例如把主色换成绿色：

```css
:root {
  --accent: #10b981;   /* 主色 */
  --accent-2: #059669; /* 渐变副色 */
}
```

### 2. 改默认科目 / 默认设置
打开 `www/js/store.js` 的 `defaults()`，修改 `subjects`（默认科目，每个可带 `targetMinutes` 目标时长）、`pomodoro`（番茄钟）等。注意：每日目标由各科目 `targetMinutes` 自动汇总，没有全局目标设置。

### 3. 新增事件类型
在 `www/js/countdown.js` 末尾的 `TYPE_LABEL` / `TYPE_ICON` 加一项，弹窗下拉框和列表图标会自动出现。

### 4. 新增统计图表
在 `www/js/charts.js` 里新增 `renderXxx(canvas, data)` 函数（参照 `renderBar`：`setup` 测量 → `animate` 动画绘制），然后在 `www/js/app.js` 的 `renderStats()` 里调用；若要加画布，先在 `index.html` 统计页加一行。

### 5. 新增页面
1. `index.html` 加 `<section id="page-xxx" class="page">`，底部导航加 `<button data-page="xxx">`
2. `js/app.js` 的 `showPage()` 里加 `if (name === 'xxx') renderXxx();`
3. 新写 `renderXxx()` 渲染内容

### 6. 接入新的 AI 服务商
`www/js/ai.js` 的 `presets()` 加一项即可。接口是 **OpenAI 兼容**的 `POST {endpoint}`，请求体 `{ model, messages }`。`buildPrompt()` 里可自由增删要发送的统计字段。

### 7. 给数据加新字段（老数据自动兼容）
在 `www/js/store.js` 的 `defaults()` 里加字段即可 —— `load()` 用了深合并，老用户本地已有的数据会自动补上默认值。

### 8. 改完记得跑测试
`countdown.js` / `focus.js` / `store.js` / `ai.js` 是纯逻辑，改完运行 `node test/logic.test.js` 回归；`app.js` / `charts.js` / `style.css` 涉及 DOM，改完在浏览器里刷新查看。

---

## 打包发布（GitHub Actions 自动构建）

本项目已配置 GitHub Actions：**推送到 `main` 分支会自动编译 APK，并发布到 Releases 页面**（见 `.github/workflows/build-apk.yml`）。

### 触发方式
- 推送到 `main` 分支（自动）
- 或在 Actions 页面手动点 `Run workflow`

### 产物
编译后 `android/app/build/outputs/apk/debug/` 下生成分架构 APK：

- `app-arm64-v8a-debug.apk` —— 主流手机
- `app-armeabi-v7a-debug.apk` —— 老款 32 位设备
- `app-x86-debug.apk`、`app-x86_64-debug.apk` —— 模拟器 / Intel 平板
- `app-universal-debug.apk` —— 含全部架构的通用包

这些 APK 会同时：
1. 作为 **Artifact** 附在本次构建上（90 天有效）
2. 发布到 **Releases** 页面（tag：`latest-build`，每次构建自动更新）

### 关于签名
当前产出的是 **debug 包**，可直接安装测试与分发。若要正式发布，建议打签名的 release 包：

```bash
keytool -genkey -v -keystore shiguang.keystore -alias shiguang -keyalg RSA -keysize 2048 -validity 10000
# 随后在 android/app/build.gradle 配置 signingConfigs，再执行：
cd android && gradlew assembleRelease
```

---

## 本地打包（可选，需要 Android 环境）

> CI 已能自动构建，本地打包仅在需要调试时使用。

### 前置
- Android Studio（含 Android SDK），或 JDK 17 + Android SDK 命令行工具
- Gradle 依赖与 Gradle 本体已配置为国内镜像（阿里云 / 腾讯云），无需额外设置

### 命令

```bash
cd countdown-app/android
gradlew assembleDebug
```

或在 Android Studio 里 `Open` 本项目的 `android/` 目录 → `Build` → `Build APK(s)`。

### 每次改完网页代码后
需要先同步再编译：

```bash
npx cap sync android
```

---

## 技术栈

纯 HTML + CSS + 原生 JavaScript（无框架、无构建步骤、无 CDN 依赖），图表用 Canvas 2D 自绘，Capacitor 打包。
