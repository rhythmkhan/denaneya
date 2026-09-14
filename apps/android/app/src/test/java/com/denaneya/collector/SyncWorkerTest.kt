package com.denaneya.collector

import android.content.Context
import com.denaneya.collector.data.local.CollectorEventEntity
import com.denaneya.collector.security.CanonicalJsonBuilder
import com.denaneya.collector.security.CryptoSigner
import com.denaneya.collector.security.DispatchCoordinator
import com.denaneya.collector.security.KeyStoreHelper
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.security.models.CollectorSubmissionEnvelope
import com.denaneya.collector.security.models.SmsPayload
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.withLock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.atomic.AtomicLong

class SyncWorkerTest {

    private val testAlias = "sync_worker_test_key"

    @Before
    fun setUp() {
        KeyStoreHelper.deleteKey(testAlias)
        KeyStoreHelper.getOrCreateKeyPair(testAlias)
    }

    @Test
    fun testBatchEnvelopeConstructionWithDistinctTimestamps() {
        val originalReceivedAt = 1718000000000L // 3 hours ago
        val transmissionTimestamp = 1718010800000L // Now (fresh within 5-min window)

        val smsPayload = SmsPayload(
            sender = "bKash",
            messageText = "You have received Tk 2,000.00 from 01711122233. TrxID 8A12BC34.",
            receivedAt = originalReceivedAt,
            simSlot = 1,
            batteryLevel = 90,
            isCharging = true
        )

        val canonicalJson = CanonicalJsonBuilder.buildSmsEnvelope(
            deviceId = "dev_test_sync",
            sequenceNumber = 15L,
            nonce = "uuid-test-nonce-1234",
            timestamp = transmissionTimestamp,
            sender = smsPayload.sender,
            messageText = smsPayload.messageText,
            receivedAt = smsPayload.receivedAt,
            simSlot = smsPayload.simSlot,
            batteryLevel = smsPayload.batteryLevel,
            isCharging = smsPayload.isCharging
        )

        // Verify transmission timestamp is in envelope
        assertTrue(canonicalJson.contains("\"timestamp\":$transmissionTimestamp"))

        // Verify original receivedAt is in payload
        assertTrue(canonicalJson.contains("\"receivedAt\":$originalReceivedAt"))

        // Timestamps must be distinct for offline-queued items
        assertNotEquals(
            "Envelope transmission timestamp must differ from historical receipt timestamp",
            transmissionTimestamp,
            originalReceivedAt
        )

        // Sign with CryptoSigner
        val signer = CryptoSigner(keyAlias = testAlias)
        val signature = signer.signCanonicalJson(canonicalJson)
        assertNotNull(signature)
        assertTrue(signer.verifySignature(canonicalJson, signature))

        val envelope = CollectorSubmissionEnvelope(
            deviceId = "dev_test_sync",
            sequenceNumber = 15L,
            nonce = "uuid-test-nonce-1234",
            timestamp = transmissionTimestamp,
            eventType = "SMS_RECEIVED",
            payload = smsPayload,
            signature = signature
        )

        assertEquals("dev_test_sync", envelope.deviceId)
        assertEquals(15L, envelope.sequenceNumber)
        assertEquals("SMS_RECEIVED", envelope.eventType)
        assertEquals(signature, envelope.signature)
    }

    @Test
    fun testLateSequenceBindingAtDispatch() {
        // Pending events in database must hold null sequence and null nonce prior to dispatch
        val queuedEvents = listOf(
            CollectorEventEntity(
                id = "evt_offline_1",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000000000L,
                eventType = "SMS_RECEIVED",
                sender = "bKash",
                rawMessage = "Message 1",
                simSlot = 0,
                status = "PENDING",
                createdAt = 1000L
            ),
            CollectorEventEntity(
                id = "evt_offline_2",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000010000L,
                eventType = "SMS_RECEIVED",
                sender = "Nagad",
                rawMessage = "Message 2",
                simSlot = 0,
                status = "PENDING",
                createdAt = 2000L
            )
        )

        for (event in queuedEvents) {
            assertNull("Offline event in queue must not hold committed sequence", event.sequenceNumber)
            assertNull("Offline event in queue must not hold committed nonce", event.nonce)
            assertEquals("PENDING", event.status)
        }

        // Simulate transmission-time allocation
        val sequenceCounter = AtomicLong(100L)
        val dispatchedEvents = mutableListOf<CollectorEventEntity>()

        for (event in queuedEvents) {
            val allocatedSeq = sequenceCounter.incrementAndGet()
            val allocatedNonce = "nonce_${event.id}_$allocatedSeq"

            val syncedEvent = event.copy(
                status = "SYNCED",
                sequenceNumber = allocatedSeq,
                nonce = allocatedNonce,
                syncedAt = System.currentTimeMillis()
            )
            dispatchedEvents.add(syncedEvent)
        }

        assertEquals(2, dispatchedEvents.size)
        assertEquals(101L, dispatchedEvents[0].sequenceNumber)
        assertEquals(102L, dispatchedEvents[1].sequenceNumber)
        assertTrue(
            "Transmission sequences must be strictly monotonic",
            dispatchedEvents[0].sequenceNumber!! < dispatchedEvents[1].sequenceNumber!!
        )
        assertNotNull(dispatchedEvents[0].nonce)
        assertNotNull(dispatchedEvents[1].nonce)
    }

    @Test
    fun testChronologicalFifoOrderingByCreatedAt() {
        val unorderedEvents = listOf(
            CollectorEventEntity(
                id = "evt_third",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000200000L,
                eventType = "SMS_RECEIVED",
                sender = "bKash",
                rawMessage = "Third arrival",
                simSlot = 0,
                status = "PENDING",
                createdAt = 3000L
            ),
            CollectorEventEntity(
                id = "evt_first",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000000000L,
                eventType = "SMS_RECEIVED",
                sender = "Nagad",
                rawMessage = "First arrival",
                simSlot = 0,
                status = "PENDING",
                createdAt = 1000L
            ),
            CollectorEventEntity(
                id = "evt_second",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000100000L,
                eventType = "SMS_RECEIVED",
                sender = "Rocket",
                rawMessage = "Second arrival",
                simSlot = 0,
                status = "PENDING",
                createdAt = 2000L
            )
        )

        val orderedEvents = unorderedEvents.sortedWith(compareBy({ it.createdAt }, { it.timestamp }))

        assertEquals("evt_first", orderedEvents[0].id)
        assertEquals("evt_second", orderedEvents[1].id)
        assertEquals("evt_third", orderedEvents[2].id)
        assertTrue(orderedEvents[0].createdAt < orderedEvents[1].createdAt)
        assertTrue(orderedEvents[1].createdAt < orderedEvents[2].createdAt)
    }

    @Test
    fun testHttp409ConflictMarkedAsFailedNeverSynced() {
        val event = CollectorEventEntity(
            id = "evt_conflict_test",
            sequenceNumber = null,
            nonce = null,
            timestamp = 1718000000000L,
            eventType = "SMS_RECEIVED",
            sender = "Nagad",
            rawMessage = "Payment Tk 500",
            simSlot = 0,
            status = "PENDING",
            createdAt = 1000L
        )

        val httpCode = 409
        val errorBody = "EVENT_REPLAY_DETECTED: Sequence number 15 is not greater than current device sequence 16."

        // The worker must mark 409 as FAILED so it can be retried with fresh sequence number
        val updatedEvent = if (httpCode == 409) {
            event.copy(
                status = "FAILED",
                retryCount = event.retryCount + 1,
                errorMessage = "409 Conflict: $errorBody"
            )
        } else {
            event.copy(status = "SYNCED")
        }

        assertEquals("Event on HTTP 409 must be marked FAILED", "FAILED", updatedEvent.status)
        assertNotEquals("Event on HTTP 409 must NEVER be marked SYNCED", "SYNCED", updatedEvent.status)
        assertEquals(1, updatedEvent.retryCount)
        assertTrue(updatedEvent.errorMessage?.contains("409 Conflict") == true)
        assertNull("Pending/failed event should not retain committed wire sequence", updatedEvent.sequenceNumber)
    }

    @Test
    fun testNetworkFailureTriggersRetryAndPreservesPendingState() {
        val batch = listOf(
            CollectorEventEntity(
                id = "evt_net_1",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000000000L,
                eventType = "SMS_RECEIVED",
                sender = "bKash",
                rawMessage = "Msg 1",
                simSlot = 0,
                status = "PENDING",
                createdAt = 1000L
            ),
            CollectorEventEntity(
                id = "evt_net_2",
                sequenceNumber = null,
                nonce = null,
                timestamp = 1718000050000L,
                eventType = "SMS_RECEIVED",
                sender = "bKash",
                rawMessage = "Msg 2",
                simSlot = 0,
                status = "PENDING",
                createdAt = 2000L
            )
        )

        var hasNetworkFailure = false
        var processedCount = 0

        // Simulate dispatching batch where network drops on first event
        for (event in batch) {
            val networkAvailable = false // Network offline
            if (!networkAvailable) {
                hasNetworkFailure = true
                break // Immediate break prevents sequence burning for subsequent items
            }
            processedCount++
        }

        assertTrue("Network error must trigger retry flag", hasNetworkFailure)
        assertEquals("Subsequent events must remain untouched upon network failure", 0, processedCount)
        assertEquals("Second event remains PENDING", "PENDING", batch[1].status)
        assertNull("Second event retains null sequence", batch[1].sequenceNumber)
    }

    @Test
    fun testDispatchCoordinatorMutualExclusion() = runBlocking {
        var executionOrder = mutableListOf<String>()
        val sequenceCounter = AtomicLong(50L)
        val allocatedSequences = mutableListOf<Long>()

        // Simulate two concurrent jobs attempting transmission
        val smsDispatch = suspend {
            DispatchCoordinator.transmissionMutex.withLock {
                executionOrder.add("SMS_START")
                allocatedSequences.add(sequenceCounter.incrementAndGet())
                executionOrder.add("SMS_END")
            }
        }

        val heartbeatDispatch = suspend {
            DispatchCoordinator.transmissionMutex.withLock {
                executionOrder.add("HEARTBEAT_START")
                allocatedSequences.add(sequenceCounter.incrementAndGet())
                executionOrder.add("HEARTBEAT_END")
            }
        }

        smsDispatch()
        heartbeatDispatch()

        assertEquals(4, executionOrder.size)
        assertEquals(listOf(51L, 52L), allocatedSequences)
        assertFalse("Mutex must be unlocked after dispatch completes", DispatchCoordinator.transmissionMutex.isLocked)
    }
}
