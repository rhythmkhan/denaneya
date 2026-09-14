package com.denaneya.collector.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.data.local.CollectorEventEntity
import com.denaneya.collector.worker.SmsSyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

class MfsNotificationListenerService : NotificationListenerService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    companion object {
        private const val TAG = "MfsNotificationListener"

        /**
         * Official Bangladesh MFS Application Package Names
         */
        val MFS_PACKAGE_MAP = mapOf(
            "com.bKash.customerapp" to "bKash",
            "com.bKash.businessapp" to "bKash",
            "com.konasl.nagad" to "Nagad",
            "com.konasl.nagad.agent" to "Nagad",
            "com.dbbl.mbs.firstapp" to "Rocket",
            "bd.com.upay.customer" to "Upay",
            "bd.com.upay.agent" to "Upay"
        )

        /**
         * Keywords indicating payment or money receipt in English & Bengali
         */
        val TRANSACTION_KEYWORDS = listOf(
            "received", "credited", "payment tk", "cash in", "money received",
            "trxid", "txnid", "টাকা পেয়েছেন", "পেমেন্ট", "ক্যাশ ইন", "জমা হয়েছে"
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        val normalizedSender = MFS_PACKAGE_MAP[packageName] ?: return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()

        val fullBody = when {
            bigText.isNotBlank() -> "$title. $bigText"
            text.isNotBlank() -> "$title. $text"
            else -> title
        }

        if (fullBody.isBlank()) return

        val lowerBody = fullBody.lowercase()
        val isTransaction = TRANSACTION_KEYWORDS.any { keyword -> lowerBody.contains(keyword) }
        if (!isTransaction) {
            Log.d(TAG, "Ignoring non-transactional MFS notification from $packageName: $title")
            return
        }

        Log.i(TAG, "Captured MFS transaction notification from $normalizedSender ($packageName)")
        val postTime = if (sbn.postTime > 0) sbn.postTime else System.currentTimeMillis()

        serviceScope.launch {
            try {
                val db = CollectorDatabase.getInstance(applicationContext)

                val entity = CollectorEventEntity(
                    id = "evt_${UUID.randomUUID().toString().replace("-", "").take(24)}",
                    sequenceNumber = null,
                    nonce = null,
                    timestamp = postTime,
                    eventType = "NOTIFICATION_RECEIVED",
                    sender = normalizedSender,
                    rawMessage = fullBody,
                    simSlot = 0,
                    status = "PENDING",
                    retryCount = 0,
                    errorMessage = null,
                    createdAt = System.currentTimeMillis(),
                    syncedAt = null
                )

                db.collectorEventDao().insertEvent(entity)
                Log.d(TAG, "Persisted notification event ${entity.id} with status=PENDING (uncommitted sequence)")

                // Trigger expedited sync
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()

                val syncRequest = OneTimeWorkRequestBuilder<SmsSyncWorker>()
                    .setConstraints(constraints)
                    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                    .build()

                WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                    "DenaNeyaExpeditedSmsSync",
                    ExistingWorkPolicy.REPLACE,
                    syncRequest
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error storing notification event", e)
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No action required on removal
    }
}
