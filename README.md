# 时光 · 倒计时与专注

一个**纯本地运行**的倒计时 + 专注计时 + 学习统计应用。纪念日倒计时（点击条目进入沉浸式详情页，可自定义背景图）、正计时专注记录、扇形/柱形/折线统计，预留 AI 接口分析学习状态。

- **零外部依赖**：不用任何 CDN，图表自研 Canvas 绘制，完全离线可用
- **本地存储**：数据只存在本机浏览器（localStorage），不联网、不上传
- **可打包成 App**：内置 Capacitor 配置，可打包成覆盖多种 CPU 架构的 Android 安装包

---

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 倒计时 | 纪念日 / 生日 / 考试 / 节日，支持「每年重复」；点击条目进入沉浸式大屏倒计时，每条可自定义背景图片 |
| 正计时专注 | 自建科目/专注项（自定义名称、目标时长、颜色），开始/暂停/结束专注会话；删除科目时可选择保留历史记录；番茄钟提醒，每日目标进度环 |
| 统计图表 | 扇形图（日 / 周 / 月范围切换）、柱形图（近 7 天）、折线图（近 30 天趋势），累计/连续天数/今日完成度 |
| AI 分析 | 预留 OpenAI 兼容接口（DeepSeek / OpenAI / Ollama / 自定义），一键生成学习状态分析 |
| 其他 | 深色/浅色/跟随系统主题，数据导出导入，响应式（手机竖屏 / 平板横屏） |

---

## 快速开始

**方式一（最简单）**：直接双击 `www/index.html`，用浏览器打开即可。

**方式二（推荐，PWA 完整支持）**：起一个本地静态服务

```bash
cd countdown-app/www
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

**跑单元测试**（需 Node.js）：

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
├── android/                # Capacitor 生成的 Android 原生工程（打包用，自动生成）
├── test/                   # 逻辑测试 + 资源校验脚本
├── capacitor.config.json   # Capacitor 打包配置
├── package.json            # 打包/测试脚本 + Capacitor 依赖
└── node_modules/           # npm 依赖（npm install 自动生成）
```

**设计原则**：每个文件单一职责，`store.js` 是唯一的数据入口，所有 UI 只通过 `Store` 读写数据。改倒计时逻辑只动 `countdown.js`，改配色只动 `style.css`，改数据字段只动 `store.js`。

---

## 如何更新（扩展指南）

### 1. 改配色 / 换主题
打开 `css/style.css`，顶部的 `:root`（浅色）和 `[data-theme="dark"]`（深色）里改 CSS 变量即可，例如把主色换成绿色：

```css
:root {
  --accent: #10b981;   /* 主色 */
  --accent-2: #059669; /* 渐变副色 */
}
```

### 2. 改默认科目 / 默认设置
打开 `js/store.js` 的 `defaults()` 函数，修改 `subjects`（默认科目，每个可带 `targetMinutes` 目标时长）、`pomodoro`（番茄钟）等。注意：每日目标由各科目 `targetMinutes` 自动汇总，没有全局目标设置。

### 3. 新增事件类型
在 `js/countdown.js` 末尾的 `TYPE_LABEL` / `TYPE_ICON` 加一项，弹窗下拉框和列表图标会自动出现，无需改其他文件。

### 4. 新增统计图表
在 `js/charts.js` 里新增一个 `renderXxx(canvas, data)` 函数（参照 `renderBar` 的结构：`setup` 测量 → `animate` 动画绘制），然后在 `js/app.js` 的 `renderStats()` 里加一个 `<canvas>` 对应调用。若要加画布，先在 `index.html` 的统计页加一行。

### 5. 新增页面（如“复盘”）
1. `index.html` 加一个 `<section id="page-xxx" class="page">`，底部导航加一个 `<button data-page="xxx">`
2. `js/app.js` 的 `showPage()` 里加 `if (name === 'xxx') renderXxx();`
3. 新写 `renderXxx()` 函数渲染内容

### 6. 接入新的 AI 服务商
`js/ai.js` 的 `presets()` 加一项即可；接口是 **OpenAI 兼容**的 `POST {endpoint}`，`{ model, messages }`。自定义服务只要兼容这个格式就能用。`buildPrompt()` 里可自由增删要发给 AI 的统计字段。

### 7. 给数据加新字段（老数据自动兼容）
在 `js/store.js` 的 `defaults()` 里加字段即可 —— `load()` 用了深合并，老用户本地已有的数据会自动补上默认值，不会报错。需要迁移逻辑时，在 `load()` 里对 `parsed` 做处理。

### 8. 改完记得跑测试
`countdown.js` / `focus.js` / `calendar.js` / `store.js` / `ai.js` 是纯逻辑，改完运行 `node test/logic.test.js` 可快速回归；`app.js` / `charts.js` / `style.css` 涉及 DOM 与绘制，改完在浏览器里刷新查看。

---

## 打包成 Android 安装包（跨架构手机 / 平板）

> 说明：网页资源（`www/`）与 Android 原生工程（`android/`）均已生成，编译前无需改动业务代码。

### 已完成（自动）
- ✅ `npm install` —— Capacitor 依赖已安装
- ✅ `npx cap add android` —— 已生成 `android/` 原生工程
- ✅ `npx cap sync android` —— 网页资源已同步进原生工程
- ✅ 已在 `android/app/build.gradle` 配置**按 CPU 架构分包**输出

### 还需一步：安装 Android Studio
本机当前是 JDK 8，而 Android Gradle Plugin 8.2 需要 **JDK 17**，且缺少 Android SDK。安装 [Android Studio](https://developer.android.com/studio)（安装时勾选 Android SDK）即可一并解决——它自带 JDK 17（JBR），不必单独安装 JDK。

### 编译 APK

**方式 A：Android Studio（推荐）**
1. 打开 Android Studio → `Open` → 选择 `countdown-app/android`
2. 等右下角 Gradle Sync 完成（首次需联网下载依赖）
3. 菜单 `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
4. 完成后点提示中的 `locate` 查看产物

**方式 B：命令行**（在 Android Studio 底部 Terminal 里执行，自动使用内置 JDK 17）
```bash
cd countdown-app/android
gradlew assembleDebug
```

### 产物（不同架构）
已配置 ABI 分包，编译后 `android/app/build/outputs/apk/debug/` 会生成：

- `app-arm64-v8a-debug.apk` —— 绝大多数现代手机
- `app-armeabi-v7a-debug.apk` —— 老款 32 位设备
- `app-x86-debug.apk`、`app-x86_64-debug.apk` —— 模拟器 / Intel 平板
- `app-universal-debug.apk` —— 含全部架构的通用包（不确定设备架构时发这个）

### 正式分发（可选）
debug 包可直接安装测试。正式推广建议打签名的 release 包：
```bash
keytool -genkey -v -keystore shiguang.keystore -alias shiguang -keyalg RSA -keysize 2048 -validity 10000
# 随后在 android/app/build.gradle 配置 signingConfigs，再执行：
cd android && gradlew assembleRelease
```

### 每次改完代码后
网页改动只需重新同步，再编译：
```bash
npx cap sync android
```

### 免打包的轻量替代（PWA）
如果只想快速让手机/平板用起来，起本地服务后，手机浏览器打开同一局域网地址，选择「添加到主屏幕」，即可像 App 一样全屏离线使用。

---

## 常见问题

- **数据会丢吗？** 数据存在浏览器 localStorage，换浏览器/清缓存会丢；建议定期用「设置 → 导出备份」保存 JSON。
- **AI 分析提示接口错误？** 检查「设置」里是否启用并填写了正确的接口地址、Key、模型；本机自建可用 Ollama。
- **双击 www/index.html 能直接用吗？** 能。唯一区别是 PWA 的「添加到主屏幕」需通过 http 服务打开。

## 技术栈

纯 HTML + CSS + 原生 JavaScript（无框架、无构建步骤、无 CDN 依赖）。图表用 Canvas 2D 自绘。
