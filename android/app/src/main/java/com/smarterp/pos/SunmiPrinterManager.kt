package com.smarterp.pos

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import woyou.aidlservice.jiuiv5.IWoyouService

/**
 * SunmiPrinterManager — singleton that owns the AIDL service binding to the
 * SUNMI built-in printer daemon (woyou.aidlservice.jiuiv5).
 *
 * Behaviour:
 *  • Connects on first call to init().
 *  • Reconnects automatically 2 s after the remote service crashes (IBinder
 *    death recipient) or the OS drops the binding (onServiceDisconnected).
 *  • Callers obtain the live service reference via get(); if the printer is
 *    temporarily disconnected, get() returns null and the call is silently
 *    skipped (ReceiptPrinter checks for null before using it).
 *
 * This object is completely independent of the ESC/POS / browser print paths
 * used on non-SUNMI devices.
 */
object SunmiPrinterManager {

    @Volatile private var printer: IWoyouService? = null
    private var context: Context? = null
    private val handler = Handler(Looper.getMainLooper())

    private val deathRecipient = IBinder.DeathRecipient {
        printer = null
        scheduleRebind(0)
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            printer = IWoyouService.Stub.asInterface(service)
            service?.linkToDeath(deathRecipient, 0)
            android.util.Log.i("SunmiPrinterManager", "Printer service connected")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            printer = null
            scheduleRebind(2_000)
        }
    }

    fun init(ctx: Context) {
        context = ctx.applicationContext
        scheduleRebind(0)
    }

    fun get(): IWoyouService? = printer

    private fun scheduleRebind(delayMs: Long) {
        handler.postDelayed({ bind() }, delayMs)
    }

    private fun bind() {
        val ctx = context ?: return
        val intent = Intent().apply {
            setPackage("woyou.aidlservice.jiuiv5")
            action = "woyou.aidlservice.jiuiv5.IWoyouService"
        }
        try {
            ctx.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            android.util.Log.e("SunmiPrinterManager", "bindService failed: ${e.message}", e)
            scheduleRebind(5_000)
        }
    }
}
