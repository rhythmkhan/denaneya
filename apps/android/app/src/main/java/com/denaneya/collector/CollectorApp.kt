package com.denaneya.collector

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.worker.HeartbeatWorker
import java.util.concurrent.TimeUnit

class CollectorApp : Application() {

    companion object {
        private const val TAG = "CollectorApp"
        const val NOTIFICATION_CHANNEL_SYNC = "denaneya_sync_channel"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing DenaNeya Collector Application...")

        // 1. Create Notification Channels
        createNotificationChannels()

        // 2. Initialize Database & Secure Storage
        CollectorDatabase.getInstance(this)
        val secureStorage = SecureStorage.getInstance(this)

        // 3. Schedule 15-minute Periodic Heartbeat if device is paired
        if (secureStorage.isPaired()) {
            schedulePeriodicHeartbeat()
        }
    }

    fun schedulePeriodicHeartbeat() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(
            15, TimeUnit.MINUTES,
            5, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "DenaNeyaPeriodicHeartbeat",
            ExistingPeriodicWorkPolicy.KEEP,
            heartbeatRequest
        )
        Log.i(TAG, "Enqueued 15-minute Periodic Heartbeat worker.")
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_SYNC,
                "DenaNeya SMS Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows background synchronization status for MFS payments"
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
