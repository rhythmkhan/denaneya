package com.denaneya.collector.security

import android.content.Context
import android.util.Log
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs

/**
 * Monitors and compensates for network time drift between device and backend server.
 * Keeps timestamps strictly within the backend's ±300s (5-minute) freshness window.
 */
class TimeSyncManager(context: Context) {

    private val secureStorage = SecureStorage.getInstance(context)
    private val clockOffsetMs = AtomicLong(secureStorage.getClockOffsetMs())

    companion object {
        private const val TAG = "TimeSyncManager"
        const val MAX_ALLOWED_DRIFT_MS = 300_000L // 5 minutes
        const val DRIFT_WARNING_THRESHOLD_MS = 240_000L // 4 minutes

        @Volatile
        private var instance: TimeSyncManager? = null

        fun getInstance(context: Context): TimeSyncManager {
            return instance ?: synchronized(this) {
                instance ?: TimeSyncManager(context.applicationContext).also { instance = it }
            }
        }
    }

    /**
     * Returns the drift-compensated epoch timestamp in milliseconds.
     */
    fun getSynchronizedTimestamp(): Long {
        return System.currentTimeMillis() + clockOffsetMs.get()
    }

    /**
     * Updates the clock offset using an authoritative server timestamp.
     */
    fun updateServerTime(serverEpochMs: Long, requestRoundTripTimeMs: Long = 0L) {
        val estimatedServerTimeNow = serverEpochMs + (requestRoundTripTimeMs / 2)
        val deviceTimeNow = System.currentTimeMillis()
        val newOffset = estimatedServerTimeNow - deviceTimeNow

        clockOffsetMs.set(newOffset)
        secureStorage.setClockOffsetMs(newOffset)

        Log.d(TAG, "Updated clock offset to ${newOffset}ms (abs drift: ${abs(newOffset)}ms)")

        if (abs(newOffset) > DRIFT_WARNING_THRESHOLD_MS) {
            Log.w(TAG, "Device clock drift is critically high (${newOffset}ms). Server will reject events at 300,000ms.")
        }
    }

    /**
     * Updates server time from an ISO 8601 string.
     */
    fun updateServerTimeFromIso(isoString: String) {
        try {
            val epochMs = Instant.parse(isoString).toEpochMilli()
            updateServerTime(epochMs)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse server ISO time: $isoString", e)
        }
    }

    /**
     * Checks if current clock skew is within acceptable bounds.
     */
    fun isClockSkewAcceptable(): Boolean {
        return abs(clockOffsetMs.get()) < MAX_ALLOWED_DRIFT_MS
    }
}
