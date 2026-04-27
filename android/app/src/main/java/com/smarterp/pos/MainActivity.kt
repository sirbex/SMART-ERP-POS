package com.smarterp.pos

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * MainActivity — hosts the React PWA in a WebView and injects the SUNMI
 * printer bridge so that `window.SunmiPrinter.printReceipt(json)` calls
 * from JavaScript are dispatched to the hardware printer.
 *
 * The existing ESC/POS / browser-print pipeline used on Windows/LAN
 * devices is completely unaffected; it is only ever reached when this
 * bridge is NOT present in the window context.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialise the SUNMI printer service connection (auto-reconnects on crash)
        SunmiPrinterManager.init(this)

        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()

        // Inject the bridge: `window.SunmiPrinter` becomes available to JS
        webView.addJavascriptInterface(PrintBridge(), "SunmiPrinter")

        setContentView(webView)
        webView.loadUrl("https://wizarddigital-inv.com")   // Production PWA URL
    }
}
