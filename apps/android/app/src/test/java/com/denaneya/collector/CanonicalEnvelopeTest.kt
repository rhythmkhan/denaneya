package com.denaneya.collector

import com.denaneya.collector.security.CanonicalJsonBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalEnvelopeTest {

    @Test
    fun testSmsCanonicalEnvelopeKeyOrdering() {
        val deviceId = "dev_48f5e6a1b2c3d4e5"
        val sequenceNumber = 42L
        val nonce = "7b2d5c31-8f9a-4c2e-9a1b-3d5f7e8a9b0c"
        val timestamp = 1718000000000L
        val sender = "bKash"
        val messageText = "You have received Tk 1,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 25,430.00. TrxID 9K28JA821."
        val receivedAt = 1718000000000L
        val simSlot = 0
        val batteryLevel = 85
        val isCharging = false

        val canonical = CanonicalJsonBuilder.buildSmsEnvelope(
            deviceId = deviceId,
            sequenceNumber = sequenceNumber,
            nonce = nonce,
            timestamp = timestamp,
            sender = sender,
            messageText = messageText,
            receivedAt = receivedAt,
            simSlot = simSlot,
            batteryLevel = batteryLevel,
            isCharging = isCharging
        )

        // 1. Verify exact top-level order of keys:
        // "deviceId" -> "sequenceNumber" -> "nonce" -> "timestamp" -> "eventType" -> "payload"
        val expectedPrefix = "{\"deviceId\":\"$deviceId\",\"sequenceNumber\":$sequenceNumber,\"nonce\":\"$nonce\",\"timestamp\":$timestamp,\"eventType\":\"SMS_RECEIVED\",\"payload\":{"
        assertTrue("Canonical JSON must start with exact top-level keys in order", canonical.startsWith(expectedPrefix))

        // 2. Verify no whitespace around colons or commas
        assertFalse("Canonical JSON must not contain ': ' whitespace", canonical.contains(": "))
        assertFalse("Canonical JSON must not contain ', ' whitespace", canonical.contains(", "))

        // 3. Verify sequenceNumber and timestamp are numbers (not strings)
        assertTrue("sequenceNumber must not be quoted", canonical.contains("\"sequenceNumber\":42,"))
        assertTrue("timestamp must not be quoted", canonical.contains("\"timestamp\":1718000000000,"))

        // 4. Verify payload fields
        assertTrue(canonical.contains("\"sender\":\"bKash\""))
        assertTrue(canonical.contains("\"messageText\":\"" + CanonicalJsonBuilder.escapeString(messageText).removeSurrounding("\"") + "\""))
        assertTrue(canonical.contains("\"receivedAt\":1718000000000"))
        assertTrue(canonical.contains("\"simSlot\":0"))
        assertTrue(canonical.contains("\"batteryLevel\":85"))
        assertTrue(canonical.contains("\"isCharging\":false"))

        // 5. Must end with closing brace
        assertTrue(canonical.endsWith("}}"))
    }

    @Test
    fun testHeartbeatCanonicalEnvelopeFormat() {
        val canonical = CanonicalJsonBuilder.buildHeartbeatEnvelope(
            deviceId = "dev_heartbeat_1",
            sequenceNumber = 100L,
            nonce = "00000000-0000-0000-0000-000000000000",
            timestamp = 1718000000500L,
            batteryLevel = 92,
            isCharging = true,
            networkType = "WIFI",
            pendingQueueSize = 3,
            appVersion = "1.0.0"
        )

        val expectedStart = "{\"deviceId\":\"dev_heartbeat_1\",\"sequenceNumber\":100,\"nonce\":\"00000000-0000-0000-0000-000000000000\",\"timestamp\":1718000000500,\"eventType\":\"HEARTBEAT\",\"payload\":{"
        assertTrue(canonical.startsWith(expectedStart))
        assertTrue(canonical.contains("\"batteryLevel\":92"))
        assertTrue(canonical.contains("\"isCharging\":true"))
        assertTrue(canonical.contains("\"networkType\":\"WIFI\""))
        assertTrue(canonical.contains("\"pendingQueueSize\":3"))
        assertTrue(canonical.contains("\"appVersion\":\"1.0.0\""))
    }

    @Test
    fun testSpecialCharacterEscaping() {
        val textWithSpecialChars = "Line 1\nLine 2\tTabbed \"Quotes\" and \\backslash and Bengali: দেনা-নেওয়া সহজ।"
        val escaped = CanonicalJsonBuilder.escapeString(textWithSpecialChars)

        assertTrue("Must escape newline", escaped.contains("\\n"))
        assertTrue("Must escape tab", escaped.contains("\\t"))
        assertTrue("Must escape double quotes", escaped.contains("\\\""))
        assertTrue("Must escape backslash", escaped.contains("\\\\"))
        assertTrue("Must preserve Unicode Bengali characters intact", escaped.contains("দেনা-নেওয়া সহজ।"))
    }
}
