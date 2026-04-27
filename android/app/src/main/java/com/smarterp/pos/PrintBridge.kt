package com.smarterp.pos

import android.webkit.JavascriptInterface
import com.google.gson.Gson

/**
 * PrintBridge — JavaScript ↔ Kotlin bridge object injected as
 * `window.SunmiPrinter` in the WebView.
 *
 * The frontend calls:
 *   window.SunmiPrinter.printReceipt(JSON.stringify(receiptData))
 *
 * and this class deserialises the payload and delegates to ReceiptPrinter.
 * No other bridge methods exist; the existing print pipeline (ESC/POS,
 * browser print) is never touched.
 */
class PrintBridge {

    private val gson = Gson()

    @JavascriptInterface
    fun printReceipt(json: String) {
        try {
            val data = gson.fromJson(json, ReceiptData::class.java)
            ReceiptPrinter.printReceipt(data)
        } catch (e: Exception) {
            // Silently absorb parse / print errors so the JS caller is not
            // disrupted; real errors are visible in logcat.
            android.util.Log.e("PrintBridge", "printReceipt failed: ${e.message}", e)
        }
    }
}
