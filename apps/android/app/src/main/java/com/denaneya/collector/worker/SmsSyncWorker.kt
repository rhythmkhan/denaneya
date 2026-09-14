package com.denaneya.collector.worker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.data.remote.NetworkClient
import com.denaneya.collector.security.CanonicalJsonBuilder
import com.denaneya.collector.security.CryptoSigner
import com.denaneya.collector.security.DispatchCoordinator
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.security.SequenceManager
import com.denaneya.collector.security.TimeSyncManager
import com.denaneya.collector.security.models.CollectorSubmissionEnvelope
import com.denaneya.collector.security.models.SmsPayload
import kotlinx.coroutines.sync.withLock
import java.io.IOException

class SmsSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "SmsSyncWorker"
        const val BATCH_SIZE = 20
    }

    override suspend fun doWork(): Result {
        val secureStorage = SecureStorage.getInstance(applicationContext)
        val deviceId = secureStorage.getDeviceId()

        if (deviceId.isNullOrBlank() || !secureStorage.isPaired()) {
            Log.w(TAG, "Device not paired. Skipping SMS sync.")
            return Result.failure()
        }

        val db = CollectorDatabase.getInstance(applicationContext)
        val dao = db.collectorEventDao()

        // Reset any stale SYNCING events from previous process crashes
        dao.resetSyncingToPending()

        // 1. Fetch batch of pending events in strict FIFO arrival order
        val pendingEvents = dao.getPendingEvents(BATCH_SIZE)
        if (pendingEvents.isEmpty()) {
            Log.d(TAG, "No pending events to sync.")
            return Result.success()
        }

        Log.i(TAG, "Starting sync for ${pendingEvents.size} events.")

        // Mark as SYNCING
        val eventIds = pendingEvents.map { it.id }
        dao.markEventsSyncing(eventIds)

        val apiService = NetworkClient.getApiService(applicationContext)
        val cryptoSigner = CryptoSigner(applicationContext)
        val seqManager = SequenceManager.getInstance(applicationContext)
        val timeSyncManager = TimeSyncManager.getInstance(applicationContext)
        val currentBatteryLevel = getBatteryLevel()

        var hasNetworkFailure = false

        for (event in pendingEvents) {
            try {
                // Execute sequence allocation and wire transmission atomically under mutex
                DispatchCoordinator.transmissionMutex.withLock {
                    // Late sequence binding at transmission time
                    val wireSeq = seqManager.nextSequenceNumber()
                    val wireNonce = seqManager.nextNonce()
                    val wireTimestamp = timeSyncManager.getSynchronizedTimestamp()

                    // 2. Prepare payload DTO: preserve original receipt timestamp
                    val smsPayload = SmsPayload(
                        sender = event.sender,
                        messageText = event.rawMessage,
                        receivedAt = event.timestamp,
                        simSlot = event.simSlot,
                        batteryLevel = currentBatteryLevel
                    )

                    // 3. Build Canonical Envelope for transmission
                    val canonicalJson = CanonicalJsonBuilder.buildSmsEnvelope(
                        deviceId = deviceId,
                        sequenceNumber = wireSeq,
                        nonce = wireNonce,
                        timestamp = wireTimestamp,
                        sender = event.sender,
                        messageText = event.rawMessage,
                        receivedAt = event.timestamp,
                        simSlot = event.simSlot,
                        batteryLevel = currentBatteryLevel
                    )

                    // 4. Hardware ECDSA P-256 Signature
                    val signatureBase64 = cryptoSigner.signCanonicalJson(canonicalJson)

                    val requestDto = CollectorSubmissionEnvelope(
                        deviceId = deviceId,
                        sequenceNumber = wireSeq,
                        nonce = wireNonce,
                        timestamp = wireTimestamp,
                        eventType = "SMS_RECEIVED",
                        payload = smsPayload,
                        signature = signatureBase64
                    )

                    // 5. HTTP POST /api/v1/devices/sms
                    val response = apiService.submitSmsEvent(requestDto)

                    if (response.isSuccessful) {
                        val body = response.body()
                        Log.i(TAG, "Event ${event.id} synced successfully (seq=$wireSeq). Status=${body?.status}, smsId=${body?.smsId}")
                        dao.markEventSynced(event.id, wireSeq, wireNonce)
                        secureStorage.setLastHeartbeatAt(wireTimestamp)
                    } else {
                        val httpCode = response.code()
                        val errorBody = response.errorBody()?.string().orEmpty()

                        if (httpCode == 409) {
                            Log.w(TAG, "409 Conflict for event ${event.id} (seq=$wireSeq): $errorBody. Marking FAILED for retry with fresh sequence.")
                            dao.markEventsFailed(listOf(event.id), "409 Conflict: $errorBody")
                            hasNetworkFailure = true
                        } else if (httpCode == 401) {
                            Log.e(TAG, "401 Unauthorized: Device revoked or unregistered.")
                            dao.markEventsFailed(listOf(event.id), "401 Unauthorized")
                            return Result.failure()
                        } else if (httpCode == 422) {
                            Log.e(TAG, "422 Validation Error: $errorBody")
                            dao.markEventsFailed(listOf(event.id), "422 Validation Error: $errorBody")
                        } else {
                            Log.w(TAG, "Server error $httpCode for event ${event.id}: $errorBody")
                            dao.markEventsFailed(listOf(event.id), "HTTP $httpCode: $errorBody")
                            hasNetworkFailure = true
                        }
                    }
                }
                if (hasNetworkFailure) {
                    break
                }
            } catch (e: IOException) {
                Log.w(TAG, "Network I/O failure syncing event ${event.id}: ${e.message}")
                dao.markEventsFailed(listOf(event.id), "Network error: ${e.message}")
                hasNetworkFailure = true
                break
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected error processing event ${event.id}", e)
                dao.markEventsFailed(listOf(event.id), "Fatal: ${e.message}")
            }
        }

        return if (hasNetworkFailure) {
            Result.retry()
        } else {
            val remainingCount = dao.getPendingCount()
            if (remainingCount > 0) {
                Log.d(TAG, "$remainingCount events still pending.")
            }
            Result.success()
        }
    }

    private fun getBatteryLevel(): Int {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            applicationContext.registerReceiver(null, filter)
        }
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) {
            (level * 100) / scale
        } else {
            100
        }
    }
}
