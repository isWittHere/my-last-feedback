package com.dji.quiz

import android.annotation.SuppressLint
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.MenuItem
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var toolbar: Toolbar
    private lateinit var toolbarDivider: View
    private lateinit var toolbarContainer: View
    private var toolbarTabContainer: LinearLayout? = null
    private var currentIsDark: Boolean = false
    /** 原生 Toolbar 容器高度 (dp), 用于 JS --sat */
    var nativeToolbarHeightDp: Float = 0f

    /** 最近一次系统栏 inset (dp), 用于 onPageFinished 后再次注入 */
    private var lastInsetTopDp: Float = 0f
    private var lastInsetBottomDp: Float = 0f
    private var lastInsetLeftDp: Float = 0f
    private var lastInsetRightDp: Float = 0f

    /** 首次加载 URL 是否已启动 (避免竞态重复加载) */
    private var initialLoadStarted: Boolean = false
    private val pageUrl = "https://appassets.androidplatform.net/assets/web/index.html"

    private fun startInitialLoadIfNeeded() {
        if (initialLoadStarted) return
        initialLoadStarted = true
        webView.loadUrl(pageUrl)
    }

    /** 把 system bars insets 写入 H5 CSS 变量 (--sab/--sal/--sar); --sat 由 JS 根据 toolbar 状态管理 */
    private fun injectSafeAreaInsets() {
        if (!::webView.isInitialized) return
        val js = "(function(){try{var d=document.documentElement;if(!d)return;" +
            "d.style.setProperty('--sab','" + lastInsetBottomDp + "px');" +
            "d.style.setProperty('--sal','" + lastInsetLeftDp + "px');" +
            "d.style.setProperty('--sar','" + lastInsetRightDp + "px');" +
            "}catch(e){}})()"
        webView.evaluateJavascript(js, null)
    }

    /** 暴露给 JS 的桥, 用于主动退出 APP / 同步主题 / 控制原生顶栏 */
    class NativeBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun exitApp() {
            activity.runOnUiThread { activity.finish() }
        }
        /** JS 告诉 Native 当前应用内主题, 以便调整状态栏前景色 */
        @JavascriptInterface
        fun setTheme(theme: String) {
            activity.runOnUiThread { activity.applyBarAppearance(theme == "dark") }
        }
        /** 显示原生顶栏 (导航页使用) */
        @JavascriptInterface
        fun showToolbar(title: String, showBack: String) {
            activity.runOnUiThread {
                activity.clearToolbarTabs()
                activity.toolbarContainer.visibility = View.VISIBLE
                activity.supportActionBar?.title = title
                activity.supportActionBar?.setDisplayHomeAsUpEnabled(showBack == "true")
            }
        }
        /** 获取原生 Toolbar 高度 (dp), 供 JS 设置 --sat */
        @JavascriptInterface
        fun getToolbarHeight(): Float {
            return activity.nativeToolbarHeightDp
        }
        /** 显示原生顶栏 + 内嵌段选器 (笔记本页使用) */
        @JavascriptInterface
        fun showToolbarTabs(tabsJson: String, activeId: String) {
            activity.runOnUiThread {
                activity.showTabsInToolbar(tabsJson, activeId)
            }
        }
        /** 隐藏原生顶栏 (答题页使用, 由 HTML topbar 接管) */
        @JavascriptInterface
        fun hideToolbar() {
            activity.runOnUiThread {
                activity.clearToolbarTabs()
                activity.toolbarContainer.visibility = View.GONE
            }
        }
        /** JS 获取系统栏安全区域 insets (dp), 顺序: top,bottom,left,right */
        @JavascriptInterface
        fun getInsets(): String {
            if (activity.lastInsetTopDp > 0f || activity.lastInsetBottomDp > 0f) {
                return "${activity.lastInsetTopDp},${activity.lastInsetBottomDp},${activity.lastInsetLeftDp},${activity.lastInsetRightDp}"
            }
            val raw = activity.window.decorView.rootWindowInsets
            if (raw != null) {
                val compat = WindowInsetsCompat.toWindowInsetsCompat(raw)
                val bars = compat.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
                )
                val d = activity.resources.displayMetrics.density
                return "${bars.top / d},${bars.bottom / d},${bars.left / d},${bars.right / d}"
            }
            return "0,0,0,0"
        }
    }

    /** 调整状态栏/导航栏图标颜色: isDark=true -> 浅色图标; 同时同步根容器背景色 (状态栏可视区) */
    fun applyBarAppearance(isDark: Boolean) {
        currentIsDark = isDark
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isDark
            isAppearanceLightNavigationBars = !isDark
        }
        val rootView = findViewById<android.view.View>(R.id.root)
        rootView?.setBackgroundColor(if (isDark) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
        // 同步原生 Toolbar 颜色与 H5 主题一致
        if (::toolbar.isInitialized) {
            toolbar.setBackgroundColor(if (isDark) 0xFF0A0A0A.toInt() else 0xFFFFFFFF.toInt())
            toolbar.setTitleTextColor(if (isDark) 0xFFF5F5F5.toInt() else 0xFF1F2329.toInt())
            // 返回箭头颜色
            toolbar.navigationIcon?.setTint(if (isDark) 0xFFF5F5F5.toInt() else 0xFF1F2329.toInt())
        }
        if (::toolbarDivider.isInitialized) {
            toolbarDivider.setBackgroundColor(if (isDark) 0xFF2A2A2A.toInt() else 0xFFE5E7EB.toInt())
        }
    }

    /** 清除 Toolbar 中的段选器 */
    fun clearToolbarTabs() {
        toolbarTabContainer?.let {
            toolbar.removeView(it)
            toolbarTabContainer = null
        }
    }

    /** 在 Toolbar 中显示段选器 (替代标题) */
    fun showTabsInToolbar(tabsJson: String, activeId: String) {
        clearToolbarTabs()
        toolbarContainer.visibility = View.VISIBLE
        supportActionBar?.title = ""
        supportActionBar?.setDisplayHomeAsUpEnabled(false)

        val isDark = currentIsDark
        val tabs = JSONArray(tabsJson)
        val density = resources.displayMetrics.density

        // 外部容器 (药丸形)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(if (isDark) 0xFF1A1A1A.toInt() else 0xFFF2F3F5.toInt())
                cornerRadius = 999 * density
            }
            val p = (4 * density).toInt()
            setPadding(p, p, p, p)
            layoutParams = Toolbar.LayoutParams(
                Toolbar.LayoutParams.WRAP_CONTENT,
                Toolbar.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        }

        for (i in 0 until tabs.length()) {
            val tab = tabs.getJSONObject(i)
            val id = tab.getString("id")
            val label = tab.getString("label")
            val isActive = id == activeId

            val btn = TextView(this).apply {
                text = label
                textSize = 13f
                val px = (12 * density).toInt()
                val py = (5 * density).toInt()
                setPadding(px, py, px, py)
                gravity = Gravity.CENTER
                if (isActive) {
                    setTextColor(if (isDark) 0xFFF5F5F5.toInt() else 0xFF1F2329.toInt())
                    background = GradientDrawable().apply {
                        setColor(if (isDark) 0xFF333333.toInt() else 0xFFFFFFFF.toInt())
                        cornerRadius = 999 * density
                    }
                } else {
                    setTextColor(if (isDark) 0xFFA1A1AA.toInt() else 0xFF8A8F99.toInt())
                    background = null
                }
                setOnClickListener {
                    webView.evaluateJavascript("app._onNativeTab('$id')", null)
                }
            }
            container.addView(btn)
        }

        toolbar.addView(container)
        toolbarTabContainer = container
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge: 透明状态栏/导航栏, WebView 全屏延伸到状态栏下方, 安全区由 CSS 变量让出
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        // 根据明暗模式设置状态栏前景颜色 (JS 可通过 DJIBridge.setTheme 覆盖)
        val uiNightMode = resources.configuration.uiMode and
            android.content.res.Configuration.UI_MODE_NIGHT_MASK
        applyBarAppearance(uiNightMode == android.content.res.Configuration.UI_MODE_NIGHT_YES)
        setContentView(R.layout.activity_main)

        val root = findViewById<android.view.View>(R.id.root)
        toolbar = findViewById(R.id.toolbar)
        toolbarDivider = findViewById(R.id.toolbar_divider)
        toolbarContainer = findViewById(R.id.toolbar_container)
        webView = findViewById(R.id.webview)
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        // 设置 Toolbar 为 SupportActionBar (获得返回箭头等原生支持)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(false)
        toolbarContainer.visibility = View.GONE

        // 计算 Toolbar 容器高度 (dp) = actionBarSize + 1dp divider
        val tv = android.util.TypedValue()
        nativeToolbarHeightDp = if (theme.resolveAttribute(android.R.attr.actionBarSize, tv, true)) {
            tv.getDimension(resources.displayMetrics) / resources.displayMetrics.density + 1f
        } else 57f

        // 终极方案: 把 status bar / 横向刘海 用原生 padding 推开 (在 WebView 之外的 FrameLayout 上),
        // 保证内容永远不会被状态栏遮挡; 底部不 padding, --sab 仍由 CSS 变量负责让出 (沉浸式 bottombar)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, 0)
            val density = resources.displayMetrics.density
            // --sat/--sal/--sar 设为 0: 已被 native padding 让出, CSS 不再重复 padding
            // --sab 仍下发: 底部 nav bar / 手势条由 H5 (.bottombar / .tabbar) 自行让出
            lastInsetTopDp = 0f
            lastInsetLeftDp = 0f
            lastInsetRightDp = 0f
            lastInsetBottomDp = bars.bottom / density
            injectSafeAreaInsets()
            startInitialLoadIfNeeded()
            insets
        }
        ViewCompat.requestApplyInsets(root)
        // 安全网: 如果 250ms 内 insets 仍未派发, 强制加载避免死白屏
        webView.postDelayed({ startInitialLoadIfNeeded() }, 250)

        // 通过 WebViewAssetLoader 以 https://appassets.androidplatform.net/ 方式加载
        // 让 localStorage / fetch 等 API 工作起来（file:// 下 fetch 会被拦）
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // 页面就绪后再次注入, 防止 insets 监听器先于 JS 执行
                injectSafeAreaInsets()
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true      // localStorage
            databaseEnabled = true
            allowFileAccess = false       // 通过 AssetLoader 更安全
            allowContentAccess = false
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
            mediaPlaybackRequiresUserGesture = false
        }

        // 注册 JS 桥: JS 可通过 window.DJIBridge.exitApp() 主动退出
        webView.addJavascriptInterface(NativeBridge(this), "DJIBridge")

        // 暗色模式适配（Android 10+）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val nightMode = resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK
            if (androidx.webkit.WebViewFeature.isFeatureSupported(
                    androidx.webkit.WebViewFeature.ALGORITHMIC_DARKENING
                )
            ) {
                androidx.webkit.WebSettingsCompat.setAlgorithmicDarkeningAllowed(
                    webView.settings,
                    nightMode == android.content.res.Configuration.UI_MODE_NIGHT_YES
                )
            }
        }

        // 首次 loadUrl 交给 setOnApplyWindowInsetsListener / postDelayed 触发, 这里不再直接调

        // 系统返回键完全交给 JS 处理: 由 app.onBack() 按当前页面路由
        // 如 JS 未加载或未定义, 再调 Bridge 退出
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val js = "(function(){try{" +
                    "if(window.app && typeof app.onBack==='function'){app.onBack();return 1;}" +
                    "}catch(e){}return 0;})()"
                webView.evaluateJavascript(js) { result ->
                    if (result == "0" || result == "null") {
                        // JS 没机会处理, 直接退出
                        finish()
                    }
                }
            }
        })
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            webView.evaluateJavascript("(function(){try{app.onBack()}catch(e){}})()", null)
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        (webView.parent as? android.view.ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
