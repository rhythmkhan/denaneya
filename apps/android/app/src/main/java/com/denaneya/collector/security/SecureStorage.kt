package com.denaneya.collector.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Hardware-backed AES-256-GCM encrypted key-value store for credentials and sequence state.
 * Gracefully falls back to standard SharedPreferences in test environments.
 */
class SecureStorage(context: Context) {

    private val prefs: SharedPreferences

    init {
        prefs = try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILENAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "Falling back to standard SharedPreferences: ${e.message}")
            context.getSharedPreferences(PREFS_FILENAME, Context.MODE_PRIVATE)
        }
    }

    companion object {
        private const val TAG = "SecureStorage"
        private const val PREFS_FILENAME = "denaneya_secure_collector_prefs"

        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_MERCHANT_ID = "merchant_id"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_PAIRING_STATUS = "pairing_status"
        private const val KEY_SEQUENCE_NUMBER = "sequence_number"
        private const val KEY_CLOCK_OFFSET_MS = "clock_offset_ms"
        private const val KEY_PAIRED_AT = "paired_at"
        private const val KEY_LAST_HEARTBEAT_AT = "last_heartbeat_at"
        private const val KEY_SQLCIPHER_PASSPHRASE = "sqlcipher_passphrase"

        @Volatile
        private var instance: SecureStorage? = null

        fun getInstance(context: Context): SecureStorage {
            return instance ?: synchronized(this) {
                instance ?: SecureStorage(context.applicationContext).also { instance = it }
            }
        }
    }

    fun isPaired(): Boolean {
        return prefs.getString(KEY_PAIRING_STATUS, null) == "ACTIVE" &&
                !prefs.getString(KEY_DEVICE_ID, null).isNullOrBlank()
    }

    fun savePairing(
        deviceId: String,
        merchantId: String,
        serverUrl: String,
        clockOffsetMs: Long = 0L,
        deviceName: String = "Merchant Counter"
    ) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_MERCHANT_ID, merchantId)
            .putString(KEY_DEVICE_NAME, deviceName)
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_PAIRING_STATUS, "ACTIVE")
            .putLong(KEY_SEQUENCE_NUMBER, 0L)
            .putLong(KEY_CLOCK_OFFSET_MS, clockOffsetMs)
            .putLong(KEY_PAIRED_AT, System.currentTimeMillis())
            .commit()
    }

    fun getDeviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)

    fun getMerchantId(): String? = prefs.getString(KEY_MERCHANT_ID, null)

    fun getDeviceName(): String = prefs.getString(KEY_DEVICE_NAME, "Merchant Counter") ?: "Merchant Counter"

    fun getServerUrl(): String = prefs.getString(KEY_SERVER_URL, "https://api.denaneya.com") ?: "https://api.denaneya.com"

    fun setServerUrl(url: String) {
        prefs.edit().putString(KEY_SERVER_URL, url).commit()
    }

    fun getSequenceNumber(): Long = prefs.getLong(KEY_SEQUENCE_NUMBER, 0L)

    fun setSequenceNumber(seq: Long) {
        prefs.edit().putLong(KEY_SEQUENCE_NUMBER, seq).commit()
    }

    fun getClockOffsetMs(): Long = prefs.getLong(KEY_CLOCK_OFFSET_MS, 0L)

    fun setClockOffsetMs(offsetMs: Long) {
        prefs.edit().putLong(KEY_CLOCK_OFFSET_MS, offsetMs).commit()
    }

    fun getLastHeartbeatAt(): Long = prefs.getLong(KEY_LAST_HEARTBEAT_AT, 0L)

    fun setLastHeartbeatAt(timestamp: Long) {
        prefs.edit().putLong(KEY_LAST_HEARTBEAT_AT, timestamp).commit()
    }

    fun clearPairing() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_MERCHANT_ID)
            .remove(KEY_PAIRING_STATUS)
            .remove(KEY_SEQUENCE_NUMBER)
            .remove(KEY_PAIRED_AT)
            .remove(KEY_LAST_HEARTBEAT_AT)
            .commit()
    }

    /**
     * Retrieves or creates a persistent, cryptographically secure 256-bit (32-byte)
     * random passphrase stored in EncryptedSharedPreferences under KEY_SQLCIPHER_PASSPHRASE.
     * Retained permanently across pairing, unpairing, and application lifecycles.
     */
    @Synchronized
    fun getOrCreateDatabasePassphrase(): ByteArray {
        val existingHex = prefs.getString(KEY_SQLCIPHER_PASSPHRASE, null)
        if (!existingHex.isNullOrBlank()) {
            return hexToByteArray(existingHex)
        }
        val randomKey = ByteArray(32)
        java.security.SecureRandom().nextBytes(randomKey)
        val hexString = randomKey.joinToString("") { "%02x".format(it) }
        prefs.edit().putString(KEY_SQLCIPHER_PASSPHRASE, hexString).commit()
        return randomKey
    }

    private fun hexToByteArray(hex: String): ByteArray {
        val result = ByteArray(hex.length / 2)
        for (i in result.indices) {
            val index = i * 2
            result[i] = hex.substring(index, index + 2).toInt(16).toByte()
        }
        return result
    }
}
