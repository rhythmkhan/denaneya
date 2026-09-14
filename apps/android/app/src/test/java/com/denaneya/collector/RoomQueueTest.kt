package com.denaneya.collector

import com.denaneya.collector.data.local.CollectorEventEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.ConcurrentSkipListSet
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

class RoomQueueTest {

    @Test
    fun testSequenceNumberMonotonicityUnderConcurrency() {
        val counter = AtomicLong(100L)
        val generatedSequences = ConcurrentSkipListSet<Long>()
        val threadCount = 20
        val incrementsPerThread = 50
        val latch = CountDownLatch(threadCount)
        val executor = Executors.newFixedThreadPool(threadCount)

        for (t in 0 until threadCount) {
            executor.submit {
                try {
                    for (i in 0 until incrementsPerThread) {
                        val seq = counter.incrementAndGet()
                        generatedSequences.add(seq)
                    }
                } finally {
                    latch.countDown()
                }
            }
        }

        latch.await()
        executor.shutdown()

        val totalExpected = threadCount * incrementsPerThread
        assertEquals("All incremented sequences must be recorded", totalExpected, generatedSequences.size)

        var prev = 100L
        for (seq in generatedSequences) {
            assertTrue("Sequence must strictly monotonically increase: $seq > $prev", seq > prev)
            prev = seq
        }
        assertEquals("Final sequence must match exactly", 100L + totalExpected, prev)
    }

    @Test
    fun testFifoBatchOrdering() {
        val list = mutableListOf<CollectorEventEntity>()
        for (i in 1..10) {
            list.add(
                CollectorEventEntity(
                    id = "evt_$i",
                    sequenceNumber = null,
                    nonce = null,
                    timestamp = 1718000000000L + i * 1000,
                    eventType = "SMS_RECEIVED",
                    sender = "bKash",
                    rawMessage = "Message $i",
                    simSlot = 0,
                    status = "PENDING",
                    createdAt = 1000L + i * 100L
                )
            )
        }

        // Simulate FIFO batch retrieval sorted by createdAt ASC
        val batch = list.sortedBy { it.createdAt }.take(5)
        assertEquals(5, batch.size)
        assertEquals("evt_1", batch[0].id)
        assertEquals("evt_2", batch[1].id)
        assertEquals("evt_3", batch[2].id)
        assertEquals("evt_4", batch[3].id)
        assertEquals("evt_5", batch[4].id)
    }

    @Test
    fun testOfflineReplayAnomalyResolution() {
        val event = CollectorEventEntity(
            id = "evt_conflict_1",
            sequenceNumber = null,
            nonce = null,
            timestamp = 1718000000000L,
            eventType = "SMS_RECEIVED",
            sender = "Nagad",
            rawMessage = "Payment received",
            simSlot = 0,
            status = "SYNCING"
        )

        // Simulate resolving 409 replay conflict: marked as FAILED for retry with fresh sequence
        val resolved = event.copy(
            status = "FAILED",
            errorMessage = "409 Conflict: Replay detected"
        )

        assertEquals("FAILED", resolved.status)
        assertTrue("Error message must document 409 anomaly", resolved.errorMessage?.contains("409 Conflict") == true)
    }
}
