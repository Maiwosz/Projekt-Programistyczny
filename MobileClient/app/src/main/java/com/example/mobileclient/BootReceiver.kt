package com.example.mobileclient

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                val sessionManager = SessionManager(context)
                val sessionData = sessionManager.loadSession()

                if (sessionData != null) {
                    SyncForegroundService.start(context)
                }
            }
        }
    }
}