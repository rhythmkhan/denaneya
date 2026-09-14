package com.denaneya.collector.worker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.denaneya.collector.BuildConfig
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.data.remote.NetworkClient
import com.denaneya.collector.security.CanonicalJsonBuilder
import com.denaneya.collector.security.CryptoSigner
import com.denaneya.collector.security.DispatchCoordinator
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.security.SequenceManager
import com.denaneya.collector.security.TimeSyncManager
import com.denaneya.collector.security.models.CollectorSubmissionEnvelope
import com.denaneya.collector.security.models.HeartbeatPayload
import kotlinx.coroutines.sync.withLock

class HeartbeatWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "HeartbeatWorker"
        const val PURGE_THRESHOLD_DAYS_MS = 7L * 24 * 60 * 60 * 1000 // 7 days
    }

    override suspend fun doWork(): Result {
        val secureStorage = SecureStorage.getInstance(applicationContext)
        val deviceId = secureStorage.getDeviceId()

        if (deviceId.isNullOrBlank() || !secureStorage.isPaired()) {
            Log.d(TAG, "Device not paired. Skipping heartbeat.")
            return Result.success()
        }

        val db = CollectorDatabase.getInstance(applicationContext)
        val dao = db.collectorEventDao()
        val seqManager = SequenceManager.getInstance(applicationContext)
        val cryptoSigner = CryptoSigner(applicationContext)
        val timeSyncManager = TimeSyncManager.getInstance(applicationContext)

        return try {
            val apiService = NetworkClient.getApiService(applicationContext)
            DispatchCoordinator.transmissionMutex.withLock {
                val nextSeq = seqManager.nextSequenceNumber()
                val nonce = seqManager.nextNonce()
                val timestamp = timeSyncManager.getSynchronizedTimestamp()

                // 1. Gather Telemetry
                val batteryInfo = getBatteryInfo()
                val networkType = getNetworkType()
                val pendingCount = dao.getPendingCount()

                val heartbeatPayload = HeartbeatPayload(
                    batteryLevel = batteryInfo.level,
                    isCharging = batteryInfo.isCharging,
                    networkType = networkType,
                    pendingQueueSize = pendingCount,
                    appVersion = "1.0.0"
                )

                // 2. Build Canonical JSON Envelope
                val canonicalJson = CanonicalJsonBuilder.buildHeartbeatEnvelope(
                    deviceId = deviceId,
                    sequenceNumber = nextSeq,
                    nonce = nonce,
                    timestamp = timestamp,
                    batteryLevel = batteryInfo.level,
                    isCharging = batteryInfo.isCharging,
                    networkType = networkType,
                    pendingQueueSize = pendingCount,
                    appVersion = "1.0.0"
                )

                // 3. Sign Envelope
                val signature = cryptoSigner.signCanonicalJson(canonicalJson)

                val requestDto = CollectorSubmissionEnvelope(
                    deviceId = deviceId,
                    sequenceNumber = nextSeq,
                    nonce = nonce,
                    timestamp = timestamp,
                    eventType = "HEARTBEAT",
                    payload = heartbeatPayload,
                    signature = signature
                )

                // 4. Send to POST /api/v1/devices/heartbeat
                val response = apiService.submitHeartbeat(requestDto)

                if (response.isSuccessful) {
                    Log.i(TAG, "Heartbeat acknowledged by server for device $deviceId")
                    secureStorage.setLastHeartbeatAt(timestamp)

                    // 5. Database Maintenance: Purge synced events older than 7 days
                    val threshold = System.currentTimeMillis() - PURGE_THRESHOLD_DAYS_MS
                    val purgedCount = dao.purgeSyncedEventsOlderThan(threshold)
                    if (purgedCount > 0) {
                        Log.d(TAG, "Purged $purgedCount historical synced events.")
                    }

                    Result.success()
                } else {
                    Log.w(TAG, "Heartbeat failed with HTTP code ${response.code()}")
                    Result.retry()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat transmission failure", e)
            Result.retry()
        }
    }

    private data class BatteryInfo(val level: Int, val isCharging: Boolean)

    private fun getBatteryInfo(): BatteryInfo {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            applicationContext.registerReceiver(null, filter)
        }
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        val pct = if (level >= 0 && scale > 0) (level * 100) / scale else 100
        return BatteryInfo(level = pct, isCharging = isCharging)
    }

    private fun getNetworkType(): String {
        val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return "OFFLINE"
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return "OFFLINE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "OTHER"
        }
    }
}
