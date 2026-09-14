package com.denaneya.collector.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.worker.HeartbeatWorker
import java.util.concurrent.TimeUnit

class BootCompletedReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootCompletedReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.i(TAG, "Device booted. Re-scheduling periodic background workers...")

            val secureStorage = SecureStorage.getInstance(context)
            if (secureStorage.isPaired()) {
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()

                val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(
                    15, TimeUnit.MINUTES,
                    5, TimeUnit.MINUTES
                )
                    .setConstraints(constraints)
                    .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    "DenaNeyaPeriodicHeartbeat",
                    ExistingPeriodicWorkPolicy.KEEP,
                    heartbeatRequest
                )
                Log.i(TAG, "Re-enqueued Periodic Heartbeat worker.")
            }
        }
    }
}
