# Android APP 构建指南 (MLFB)

## 一、首次构建步骤

1. **打开项目**
   Android Studio → `Open` → 选择 `e:\Dev\my-last-feedback\android-mlfb` 目录

2. **等待 Gradle Sync**
   首次打开会自动下载 Gradle 8.9 + AGP 8.5 + 依赖（约 200MB，需能访问 `dl.google.com` / `maven.google.com`）。

3. **确认 SDK**
   Android Studio 会提示缺少 `compileSdk = 34` / `Build Tools`，点 `Install missing SDK` 即可。`minSdk=23`（Android 6 及以上都能装）。

4. **连接手机 或 启动模拟器**
   - 真机：打开「开发者选项 → USB 调试」，数据线插电脑
   - 或在 AVD Manager 新建一个 Pixel 模拟器

5. **运行**
   顶部工具栏选中 `app`，点 ▶ Run

## 二、生成可安装 APK

菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`，完成后点 `locate` 打开：
```
android-mlfb\app\build\outputs\apk\debug\app-debug.apk
```
直接把这个 APK 发到手机安装即可（debug 签名，仅自用完全够用）。

## 三、日常迭代流程

修改 `app/src/main/assets/web/index.html` 或 `sessions.json` 后，在 Android Studio 里点 Build → Build APK(s)。

## 四、技术要点说明

### 资源加载方式
使用 `androidx.webkit.WebViewAssetLoader`，把 `assets/web/` 映射到：
```
https://appassets.androidplatform.net/assets/web/
```
这样 `fetch('sessions.json')`、`localStorage`、相对路径图片全部正常工作（`file://` 协议下 fetch 会被浏览器跨域策略拦截）。

### 数据持久化
`localStorage` 存到应用私有沙箱：
```
/data/data/com.mlfb.app/app_webview/Default/Local Storage/
```

### 暗色模式
主题使用 `Theme.AppCompat.DayNight`，`WebSettingsCompat.setAlgorithmicDarkeningAllowed` 已启用。

### 返回键行为
- WebView 有历史栈 → 返回上一页
- 已在首页 → 退出 APP

### 屏幕方向
锁定为竖屏（`screenOrientation="portrait"`）。

### JS ↔ Native 桥
通过 `window.MlfbBridge` 暴露原生能力：
- `getInsets()` 返回 `"top,bottom,left,right"` 安全区 inset（dp）
- `setTheme("dark"|"light")` 同步状态栏前景色
- `showToolbar(title, showBack)` / `hideToolbar()` / `getToolbarHeight()`
- `exitApp()` 主动退出

## 五、目录结构

```
android-mlfb/
├── build.gradle.kts               # 项目级
├── settings.gradle.kts
├── gradle.properties
├── gradle/wrapper/
└── app/
    ├── build.gradle.kts           # 模块级
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/mlfb/app/
        │   └── MainActivity.kt    # WebView 壳 + JS 桥
        ├── assets/web/            # 前端资源
        │   ├── index.html
        │   ├── sessions.json
        │   └── phosphor/          # Phosphor Icons 字体
        └── res/
            ├── layout/activity_main.xml
            ├── values/{strings,colors,themes}.xml
            ├── drawable/ic_launcher_foreground.xml
            └── mipmap-anydpi-v26/ic_launcher*.xml
```
