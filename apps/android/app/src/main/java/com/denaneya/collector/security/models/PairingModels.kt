package com.denaneya.collector.security.models

import kotlinx.serialization.Serializable

/**
 * QR code payload scanned from merchant web dashboard.
 */
@Serializable
data class PairingQrPayload(
    val serverUrl: String,
    val merchantId: String,
    val deviceId: String,
    val pairingToken: String,
    val expiresAt: String
)

/**
 * Wire envelope sent over HTTP to `/api/v1/devices/sms` and `/api/v1/devices/heartbeat`.
 */
@Serializable
data class CollectorSubmissionEnvelope<T>(
    val deviceId: String,
    val sequenceNumber: Long,
    val nonce: String,
    val timestamp: Long,
    val eventType: String,
    val payload: T,
    val signature: String
)

@Serializable
data class SmsPayload(
    val sender: String,
    val messageText: String,
    val receivedAt: Long,
    val simSlot: Int = 0,
    val batteryLevel: Int? = null,
    val isCharging: Boolean? = null
)

@Serializable
data class HeartbeatPayload(
    val batteryLevel: Int? = null,
    val isCharging: Boolean? = null,
    val networkType: String? = null,
    val pendingQueueSize: Int? = null,
    val appVersion: String? = null
)

@Serializable
data class PairingRequestDto(
    val merchantId: String,
    val deviceId: String,
    val pairingToken: String,
    val publicKeyHex: String,
    val publicKey: String? = null,
    val model: String? = null,
    val deviceModel: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val simSlots: Int = 1
)

@Serializable
data class PairingResponseDto(
    val success: Boolean,
    val deviceId: String,
    val status: String,
    val message: String? = null,
    val registeredAt: String? = null
)

@Serializable
data class SmsResponseDto(
    val success: Boolean = true,
    val status: String? = null,
    val message: String? = null,
    val smsId: String? = null
)

@Serializable
data class HeartbeatResponseDto(
    val success: Boolean = true,
    val deviceId: String? = null,
    val status: String? = null,
    val receivedAt: String? = null
)
