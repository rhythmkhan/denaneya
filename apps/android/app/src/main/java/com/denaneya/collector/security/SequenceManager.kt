package com.denaneya.collector.security

import android.content.Context
import android.util.Log
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

/**
 * Thread-safe monotonic sequence counter and anti-replay nonce generator.
 * Backed by persistent SecureStorage with synchronous flush.
 */
class SequenceManager(context: Context) {

    private val secureStorage = SecureStorage.getInstance(context)
    private val counter: AtomicLong

    init {
        val initialSeq = secureStorage.getSequenceNumber()
        counter = AtomicLong(initialSeq)
        Log.i(TAG, "Initialized SequenceManager with sequence counter: $initialSeq")
    }

    companion object {
        private const val TAG = "SequenceManager"

        @Volatile
        private var instance: SequenceManager? = null

        fun getInstance(context: Context): SequenceManager {
            return instance ?: synchronized(this) {
                instance ?: SequenceManager(context.applicationContext).also { instance = it }
            }
        }
    }

    /**
     * Atomically increments and synchronously persists the next monotonic sequence number.
     * Guarantees sequenceNumber > lastSequenceNumber across app restarts.
     */
    @Synchronized
    fun nextSequenceNumber(): Long {
        val next = counter.incrementAndGet()
        secureStorage.setSequenceNumber(next)
        return next
    }

    /**
     * Retrieves current sequence number without incrementing.
     */
    fun currentSequenceNumber(): Long = counter.get()

    /**
     * Generates a cryptographically random UUID v4 anti-replay nonce.
     */
    fun nextNonce(): String = UUID.randomUUID().toString()
}
