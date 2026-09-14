package com.denaneya.collector.security

import android.content.Context
import android.os.Build
import android.util.Log
import com.denaneya.collector.security.models.PairingQrPayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.format.DateTimeParseException

/**
 * Manages QR code pairing, hardware key registration, and secure credentials persistence.
 */
class PairingManager(
    private val context: Context,
    private val secureStorage: SecureStorage = SecureStorage.getInstance(context)
) {

    companion object {
        private const val TAG = "PairingManager"
        private val PAIRING_TOKEN_REGEX = Regex("^pair_[0-9a-fA-F]{32,}$")
        private val DEVICE_ID_REGEX = Regex("^dev_[0-9a-fA-F]{8,}$")
    }

    sealed class PairingResult {
        data class Success(val deviceId: String, val registeredAt: String) : PairingResult()
        data class Error(val message: String, val code: Int? = null) : PairingResult()
    }

    /**
     * Parses the QR code JSON payload and verifies token constraints.
     */
    fun parseAndValidateQr(qrContent: String): Result<PairingQrPayload> {
        return try {
            val json = JSONObject(qrContent)
            val serverUrl = json.optString("serverUrl").trim().trimEnd('/')
            val merchantId = json.optString("merchantId").trim()
            val deviceId = json.optString("deviceId").trim()
            val pairingToken = json.optString("pairingToken").trim()
            val expiresAtStr = json.optString("expiresAt").trim()

            if (serverUrl.isBlank() || merchantId.isBlank() || deviceId.isBlank() ||
                pairingToken.isBlank() || expiresAtStr.isBlank()
            ) {
                return Result.failure(IllegalArgumentException("Missing required fields in QR payload."))
            }

            if (!DEVICE_ID_REGEX.matches(deviceId)) {
                return Result.failure(IllegalArgumentException("Invalid deviceId format: $deviceId"))
            }

            if (!PAIRING_TOKEN_REGEX.matches(pairingToken)) {
                return Result.failure(IllegalArgumentException("Invalid pairingToken format: $pairingToken"))
            }

            val expiresAt = try {
                Instant.parse(expiresAtStr)
            } catch (e: DateTimeParseException) {
                return Result.failure(IllegalArgumentException("Invalid expiresAt ISO timestamp: $expiresAtStr"))
            }

            if (Instant.now().isAfter(expiresAt)) {
                return Result.failure(IllegalStateException("Pairing token has already expired. Please generate a new QR."))
            }

            Result.success(
                PairingQrPayload(
                    serverUrl = serverUrl,
                    merchantId = merchantId,
                    deviceId = deviceId,
                    pairingToken = pairingToken,
                    expiresAt = expiresAtStr
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Malformed QR code content", e)
            Result.failure(IllegalArgumentException("Malformed QR code content: ${e.message}"))
        }
    }

    /**
     * Executes the complete pairing handshake asynchronously.
     */
    suspend fun executePairing(payload: PairingQrPayload): PairingResult = withContext(Dispatchers.IO) {
        val expiresAt = try {
            Instant.parse(payload.expiresAt)
        } catch (_: Exception) {
            return@withContext PairingResult.Error("Invalid expiresAt timestamp.")
        }

        if (Instant.now().isAfter(expiresAt)) {
            return@withContext PairingResult.Error("Pairing token expired before registration could complete.")
        }

        val publicKeyHex = try {
            KeyStoreHelper.getOrCreateKeyPair()
            KeyStoreHelper.exportPublicKeyHex()
        } catch (e: Exception) {
            Log.e(TAG, "Hardware Keystore key generation failed", e)
            return@withContext PairingResult.Error("Hardware Keystore key generation failed: ${e.message}")
        }

        val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        val osVersion = Build.VERSION.RELEASE ?: "Android"
        val appVersion = "1.0.0"
        val simSlots = detectSimSlotCount()

        val requestBody = JSONObject().apply {
            put("merchantId", payload.merchantId)
            put("deviceId", payload.deviceId)
            put("pairingToken", payload.pairingToken)
            put("publicKeyHex", publicKeyHex)
            put("publicKey", publicKeyHex)
            put("model", deviceModel)
            put("deviceModel", deviceModel)
            put("osVersion", osVersion)
            put("appVersion", appVersion)
            put("simSlots", simSlots)
        }.toString()

        val pairUrl = "${payload.serverUrl}/api/v1/devices/pair"
        Log.i(TAG, "Dispatching pairing request to: $pairUrl")

        var connection: HttpURLConnection? = null
        try {
            val url = URL(pairUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 15000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("User-Agent", "DenaNeya-Collector-Android/$appVersion")
            }

            connection.outputStream.use { os ->
                os.write(requestBody.toByteArray(Charsets.UTF_8))
                os.flush()
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream.bufferedReader().use { it.readText() }
            Log.d(TAG, "Pairing HTTP response ($statusCode): $responseBody")

            if (statusCode in 200..299) {
                val respJson = JSONObject(responseBody)
                val registeredAt = respJson.optString("registeredAt", Instant.now().toString())

                val serverTimeMs = try {
                    Instant.parse(registeredAt).toEpochMilli()
                } catch (_: Exception) {
                    connection.date.takeIf { it > 0 } ?: System.currentTimeMillis()
                }
                val clockOffsetMs = serverTimeMs - System.currentTimeMillis()

                secureStorage.savePairing(
                    deviceId = payload.deviceId,
                    merchantId = payload.merchantId,
                    serverUrl = payload.serverUrl,
                    clockOffsetMs = clockOffsetMs,
                    deviceName = deviceModel
                )

                PairingResult.Success(payload.deviceId, registeredAt)
            } else {
                KeyStoreHelper.deleteKey()
                val errorMessage = try {
                    val errorJson = JSONObject(responseBody)
                    errorJson.optJSONObject("error")?.optString("message")
                        ?: errorJson.optString("message", "Pairing rejected with status $statusCode")
                } catch (_: Exception) {
                    "Pairing rejected with HTTP $statusCode"
                }
                PairingResult.Error(errorMessage, statusCode)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network connection error during pairing", e)
            KeyStoreHelper.deleteKey()
            PairingResult.Error("Network error: ${e.message ?: "Failed to connect to server."}")
        } finally {
            connection?.disconnect()
        }
    }

    private fun detectSimSlotCount(): Int {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                telephonyManager?.activeModemCount?.coerceAtLeast(1) ?: 1
            } else {
                @Suppress("DEPRECATION")
                telephonyManager?.phoneCount?.coerceAtLeast(1) ?: 1
            }
        } catch (_: Exception) {
            1
        }
    }
}
