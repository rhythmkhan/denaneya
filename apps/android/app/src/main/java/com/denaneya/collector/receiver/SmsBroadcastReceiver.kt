package com.denaneya.collector.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
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
import kotlinx.coroutines.launch
import java.util.UUID

class SmsBroadcastReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsBroadcastReceiver"

        /**
         * Whitelisted Bangladesh MFS sender masks and shortcodes.
         * Corresponds to @denaneya/sms-parser verified senders.
         */
        val MFS_SENDER_WHITELIST = setOf(
            // bKash
            "BKASH", "16247",
            // Nagad
            "NAGAD", "16167",
            // Rocket (DBBL)
            "ROCKET", "16216", "DBBL",
            // Upay (UCB)
            "UPAY", "16268", "UCB"
        )

        fun isWhitelistedSender(sender: String?): Boolean {
            if (sender.isNullOrBlank()) return false
            val cleanSender = sender.trim().uppercase()
            return MFS_SENDER_WHITELIST.contains(cleanSender)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }

        val messages: Array<SmsMessage?> = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty() || messages[0] == null) return

        val firstMessage = messages[0]!!
        val sender = firstMessage.originatingAddress ?: firstMessage.displayOriginatingAddress ?: ""

        // 1. Whitelist Sender Filter
        if (!isWhitelistedSender(sender)) {
            Log.d(TAG, "Ignoring SMS from non-whitelisted sender: $sender")
            return
        }

        // 2. Reconstruct Multipart Concatenated SMS
        val bodyBuilder = StringBuilder()
        for (msg in messages) {
            if (msg != null) {
                bodyBuilder.append(msg.displayMessageBody ?: msg.messageBody ?: "")
            }
        }
        val fullMessageBody = bodyBuilder.toString()
        val receivedTimestamp = firstMessage.timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()

        // 3. Extract SIM Slot Index (Dual-SIM Support)
        val simSlot = extractSimSlot(intent)

        Log.i(TAG, "Captured MFS SMS from $sender (SIM: $simSlot, length: ${fullMessageBody.length})")

        // 4. Asynchronous DB Persistence & Expedited Sync Trigger
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = CollectorDatabase.getInstance(context)

                val entity = CollectorEventEntity(
                    id = "evt_${UUID.randomUUID().toString().replace("-", "").take(24)}",
                    sequenceNumber = null,
                    nonce = null,
                    timestamp = receivedTimestamp,
                    eventType = "SMS_RECEIVED",
                    sender = sender,
                    rawMessage = fullMessageBody,
                    simSlot = simSlot,
                    status = "PENDING",
                    retryCount = 0,
                    errorMessage = null,
                    createdAt = System.currentTimeMillis(),
                    syncedAt = null
                )

                db.collectorEventDao().insertEvent(entity)
                Log.d(TAG, "Persisted SMS event ${entity.id} with status=PENDING (uncommitted sequence)")

                // 5. Trigger Expedited WorkManager Sync
                triggerExpeditedSync(context)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to persist intercepted SMS", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun extractSimSlot(intent: Intent): Int {
        val extras = intent.extras ?: return 0
        return when {
            extras.containsKey("slot") -> extras.getInt("slot", 0)
            extras.containsKey("simSlot") -> extras.getInt("simSlot", 0)
            extras.containsKey("sim_slot") -> extras.getInt("sim_slot", 0)
            extras.containsKey("android.telephony.extra.SLOT_INDEX") ->
                extras.getInt("android.telephony.extra.SLOT_INDEX", 0)
            extras.containsKey("subscription") -> {
                val subId = extras.getInt("subscription", 0)
                if (subId > 0) 1 else 0
            }
            else -> 0
        }
    }

    private fun triggerExpeditedSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<SmsSyncWorker>()
            .setConstraints(constraints)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "DenaNeyaExpeditedSmsSync",
            ExistingWorkPolicy.REPLACE,
            syncRequest
        )
    }
}
