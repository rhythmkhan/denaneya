package com.denaneya.collector.security

import com.denaneya.collector.security.models.HeartbeatPayload
import com.denaneya.collector.security.models.SmsPayload

/**
 * Deterministic, zero-allocation Canonical JSON serializer.
 * Bypasses Android OEM ROM HashMap non-determinism to guarantee 100% byte-for-byte
 * contract equivalence with `apps/web/src/lib/api/device-auth.ts:buildCanonicalCollectorEnvelope`.
 */
object CanonicalJsonBuilder {

    /**
     * Builds the exact canonical string for an SMS_RECEIVED envelope.
     */
    fun buildSmsEnvelope(
        deviceId: String,
        sequenceNumber: Long,
        nonce: String,
        timestamp: Long,
        sender: String,
        messageText: String,
        receivedAt: Long,
        simSlot: Int,
        batteryLevel: Int? = null,
        isCharging: Boolean? = null
    ): String {
        val payloadJson = buildString {
            append('{')
            append("\"sender\":").append(escapeString(sender)).append(',')
            append("\"messageText\":").append(escapeString(messageText)).append(',')
            append("\"receivedAt\":").append(receivedAt).append(',')
            append("\"simSlot\":").append(simSlot)
            if (batteryLevel != null) {
                append(',').append("\"batteryLevel\":").append(batteryLevel)
            }
            if (isCharging != null) {
                append(',').append("\"isCharging\":").append(isCharging)
            }
            append('}')
        }

        return buildTopLevelEnvelope(
            deviceId = deviceId,
            sequenceNumber = sequenceNumber,
            nonce = nonce,
            timestamp = timestamp,
            eventType = "SMS_RECEIVED",
            payloadRawJson = payloadJson
        )
    }

    /**
     * Builds the canonical string for a Heartbeat envelope.
     */
    fun buildHeartbeatEnvelope(
        deviceId: String,
        sequenceNumber: Long,
        nonce: String,
        timestamp: Long,
        batteryLevel: Int? = null,
        isCharging: Boolean? = null,
        networkType: String? = null,
        pendingQueueSize: Int? = null,
        appVersion: String? = null
    ): String {
        val payloadJson = buildString {
            append('{')
            var hasField = false
            if (batteryLevel != null) {
                append("\"batteryLevel\":").append(batteryLevel)
                hasField = true
            }
            if (isCharging != null) {
                if (hasField) append(',')
                append("\"isCharging\":").append(isCharging)
                hasField = true
            }
            if (!networkType.isNullOrBlank()) {
                if (hasField) append(',')
                append("\"networkType\":").append(escapeString(networkType))
                hasField = true
            }
            if (pendingQueueSize != null) {
                if (hasField) append(',')
                append("\"pendingQueueSize\":").append(pendingQueueSize)
                hasField = true
            }
            if (!appVersion.isNullOrBlank()) {
                if (hasField) append(',')
                append("\"appVersion\":").append(escapeString(appVersion))
                hasField = true
            }
            append('}')
        }

        return buildTopLevelEnvelope(
            deviceId = deviceId,
            sequenceNumber = sequenceNumber,
            nonce = nonce,
            timestamp = timestamp,
            eventType = "HEARTBEAT",
            payloadRawJson = payloadJson
        )
    }

    /**
     * Builds canonical top-level envelope matching backend buildCanonicalCollectorEnvelope:
     * {"deviceId":...,"sequenceNumber":...,"nonce":...,"timestamp":...,"eventType":...,"payload":...}
     */
    fun buildTopLevelEnvelope(
        deviceId: String,
        sequenceNumber: Long,
        nonce: String,
        timestamp: Long,
        eventType: String,
        payloadRawJson: String
    ): String {
        return buildString {
            append('{')
            append("\"deviceId\":").append(escapeString(deviceId)).append(',')
            append("\"sequenceNumber\":").append(sequenceNumber).append(',')
            append("\"nonce\":").append(escapeString(nonce)).append(',')
            append("\"timestamp\":").append(timestamp).append(',')
            append("\"eventType\":").append(escapeString(eventType)).append(',')
            append("\"payload\":").append(payloadRawJson)
            append('}')
        }
    }

    /**
     * Escapes a string to conform with RFC 8259 JSON specifications.
     */
    fun escapeString(value: String): String {
        return buildString {
            append('"')
            for (char in value) {
                when (char) {
                    '"' -> append("\\\"")
                    '\\' -> append("\\\\")
                    '\b' -> append("\\b")
                    '\u000C' -> append("\\f")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> {
                        if (char < ' ') {
                            append(String.format("\\u%04x", char.code))
                        } else {
                            append(char)
                        }
                    }
                }
            }
            append('"')
        }
    }
}
