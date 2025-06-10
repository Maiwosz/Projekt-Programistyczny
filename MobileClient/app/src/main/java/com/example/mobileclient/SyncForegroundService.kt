package com.example.mobileclient

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.util.*

class SyncForegroundService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "sync_service_channel"

        fun start(context: Context) {
            val intent = Intent(context, SyncForegroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, SyncForegroundService::class.java)
            context.stopService(intent)
        }
    }

    private var serviceJob = SupervisorJob()
    private var serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var syncTimer: Timer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private lateinit var apiClient: ApiClient
    private lateinit var syncService: SyncService
    private lateinit var sessionManager: SessionManager

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        initializeServices()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        startPeriodicSync()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun initializeServices() {
        sessionManager = SessionManager(this)
        apiClient = ApiClient()

        val sessionData = sessionManager.loadSession()
        if (sessionData != null) {
            apiClient.setAuthToken(sessionData.token)
            apiClient.setSessionManager(sessionManager)
            syncService = SyncService(this, apiClient, sessionData.clientId)
        }
    }

    private fun startPeriodicSync() {
        val sessionData = sessionManager.loadSession() ?: return
        val settings = sessionManager.loadUserSettings(sessionData.username)

        syncTimer?.cancel()
        syncTimer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    serviceScope.launch {
                        performBackgroundSync()
                    }
                }
            }, 0, settings.syncIntervalMinutes * 60 * 1000L)
        }
    }

    private suspend fun performBackgroundSync() {
        try {
            updateNotification("Synchronizacja w toku...")
            syncService.performSync()
            updateNotification("Ostatnia sync: ${Date()}")
        } catch (e: Exception) {
            updateNotification("Błąd synchronizacji")
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Synchronizacja plików",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Powiadomienia o synchronizacji plików"
            setShowBadge(false)
        }

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Synchronizacja plików")
            .setContentText("Usługa synchronizacji jest aktywna")
            .setSmallIcon(R.drawable.ic_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Synchronizacja plików")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_sync)
            .setOngoing(true)
            .setSilent(true)
            .build()

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "FileSync::SyncWakeLock"
        ).apply { acquire() }
    }

    override fun onDestroy() {
        syncTimer?.cancel()
        wakeLock?.release()
        serviceJob.cancel()
        super.onDestroy()
    }
}