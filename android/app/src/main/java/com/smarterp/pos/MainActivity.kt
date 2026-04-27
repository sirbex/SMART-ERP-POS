package com.smarterp.pos

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * MainActivity — thin WebView shell that loads the production PWA and
 * exposes window.SunmiPrinter to JS via PrintBridge.
 *
 * This is a hardware driver bridge, not an app.
 * It does nothing except host the WebView and inject the printer interface.
 * All POS logic stays in the PWA — this file must NOT be modified for
 * any business logic purpose.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Connect to the SUNMI internal printer service.
        SunmiPrinterManager.init(this)

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()

        // Inject the bridge BEFORE loadUrl so window.SunmiPrinter is
        // available on the very first page load.
        webView.addJavascriptInterface(PrintBridge(), "SunmiPrinter")

        setContentView(webView)
        webView.loadUrl("https://wizarddigital-inv.com")
    }

    override fun onDestroy() {
        SunmiPrinterManager.destroy(this)
        super.onDestroy()
    }
}
