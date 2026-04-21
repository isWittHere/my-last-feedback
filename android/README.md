# Android APP 构建指南

## 一、首次构建步骤

1. **打开项目**
   Android Studio → `Open` → 选择 `e:\Dev\dji\android` 目录

2. **等待 Gradle Sync**
   首次打开会自动下载 Gradle 8.9 + AGP 8.5 + 依赖（约 200MB，需能访问 `dl.google.com` / `maven.google.com`）。如果下载慢，可在 `gradle.properties` 末尾加镜像（可选）：
   ```
   systemProp.https.proxyHost=...
   ```

3. **确认 SDK**
   Android Studio 会提示缺少 `compileSdk = 34` / `Build Tools`，点 `Install missing SDK` 即可。`minSdk=23`（Android 6 及以上都能装）。

4. **连接手机 或 启动模拟器**
   - 真机：打开「开发者选项 → USB 调试」，数据线插电脑
   - 或在 AVD Manager 新建一个 Pixel 模拟器

5. **运行**
   顶部工具栏选中 `app`，点 ▶ Run

## 二、生成可安装 APK

菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`
完成后点 `locate` 打开：
```
android\app\build\outputs\apk\debug\app-debug.apk
```
直接把这个 APK 发到手机安装即可（debug 签名，仅自用完全够用）。

> APK 预计体积 **约 5-6 MB**（WebView 壳 ~3MB + 题库 ~220KB + 图片 ~2MB）。

## 三、日常迭代流程

如果你改了 web/index.html 或 questions.json：

```powershell
# 1. 同步 web/ 到 assets/
python scripts\sync_assets.py

# 2. Android Studio 里点 Build → Build APK(s)
```

## 四、技术要点说明

### 资源加载方式
使用 `androidx.webkit.WebViewAssetLoader`，把 `assets/web/` 映射到：
```
https://appassets.androidplatform.net/assets/web/
```
这样 `fetch('questions.json')`、`localStorage`、相对路径图片全部正常工作（`file://` 协议下 fetch 会被浏览器跨域策略拦截）。

### 数据持久化
`localStorage` 会存到应用私有沙箱：
```
/data/data/com.dji.quiz/app_webview/Default/Local Storage/
```
- 卸载 APP 会清空
- 应用内不会丢失（包括系统杀进程）
- 想备份：设置页清数据 / 或单独开发导出功能

### 暗色模式
主题使用 `Theme.AppCompat.DayNight`，状态栏/导航栏随 HTML 背景 `#0b1220` 统一为深色。
`WebSettingsCompat.setAlgorithmicDarkeningAllowed` 已启用。

### 返回键行为
按系统返回键：
- WebView 有历史栈 → 返回上一页（例如从答题页回到分类选择）
- 已在首页 → 退出 APP

### 屏幕方向
锁定为竖屏（`screenOrientation="portrait"`），更贴合刷题场景。如需横屏可去掉 `AndroidManifest.xml` 对应属性。

## 五、常见问题

| 问题 | 解决 |
|---|---|
| 编译报 `JDK 17` 错误 | Android Studio 自带 JBR 17，设置 → Build Tools → Gradle → Gradle JDK 选 `Embedded JDK` |
| Gradle 下载慢 | 可改 `distributionUrl` 为腾讯镜像：`https\://mirrors.cloud.tencent.com/gradle/gradle-8.9-bin.zip` |
| 应用商店上架 | 需改 debug 为 release 签名（`keytool -genkey` 生成 keystore），并走 AAB（Google Play）或厂商商店（华为/小米）的合规流程 |
| 想加"每日提醒" | 需加 `WorkManager` + `NotificationManager`，可后续迭代 |

## 六、目录结构

```
android/
├── build.gradle.kts               # 项目级
├── settings.gradle.kts
├── gradle.properties
├── gradle/wrapper/
└── app/
    ├── build.gradle.kts           # 模块级
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/dji/quiz/
        │   └── MainActivity.kt    # 核心 50 行
        ├── assets/web/            # ← sync_assets.py 同步到这里
        │   ├── index.html
        │   ├── questions.json
        │   └── images/
        └── res/
            ├── layout/activity_main.xml
            ├── values/{strings,colors,themes}.xml
            ├── drawable/ic_launcher_foreground.xml
            └── mipmap-anydpi-v26/ic_launcher*.xml
```
