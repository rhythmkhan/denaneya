package com.denaneya.collector.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface CollectorEventDao {

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertEvent(event: CollectorEventEntity): Long

    @Query("SELECT * FROM collector_events WHERE status IN ('PENDING', 'FAILED') ORDER BY created_at ASC, timestamp ASC LIMIT :limit")
    suspend fun getPendingEvents(limit: Int = 20): List<CollectorEventEntity>

    @Query("SELECT * FROM collector_events WHERE id = :id LIMIT 1")
    suspend fun getEventById(id: String): CollectorEventEntity?

    @Query("UPDATE collector_events SET status = 'SYNCING' WHERE id IN (:ids)")
    suspend fun markEventsSyncing(ids: List<String>): Int

    /**
     * Records server acknowledgement with committed wire sequence number and nonce.
     */
    @Query("UPDATE collector_events SET status = 'SYNCED', sequence_number = :sequenceNumber, nonce = :nonce, synced_at = :syncedAt, error_message = null WHERE id = :id")
    suspend fun markEventSynced(
        id: String,
        sequenceNumber: Long,
        nonce: String,
        syncedAt: Long = System.currentTimeMillis()
    ): Int

    @Query("UPDATE collector_events SET status = 'SYNCED', synced_at = :syncedAt, error_message = null WHERE id IN (:ids)")
    suspend fun markEventsSynced(ids: List<String>, syncedAt: Long = System.currentTimeMillis()): Int

    @Query("UPDATE collector_events SET status = 'FAILED', retry_count = retry_count + 1, error_message = :error WHERE id IN (:ids)")
    suspend fun markEventsFailed(ids: List<String>, error: String?): Int

    /**
     * Resolves an anomaly (e.g. 409 replay detected on backend) to prevent blocking the FIFO queue.
     */
    @Query("UPDATE collector_events SET status = 'SYNCED', synced_at = :timestamp, error_message = :anomalyNote WHERE id IN (:ids)")
    suspend fun markEventsResolvedAnomaly(ids: List<String>, anomalyNote: String, timestamp: Long = System.currentTimeMillis()): Int

    @Query("DELETE FROM collector_events WHERE status = 'SYNCED' AND created_at < :thresholdTimestamp")
    suspend fun purgeSyncedEventsOlderThan(thresholdTimestamp: Long): Int

    @Query("SELECT COUNT(*) FROM collector_events WHERE status IN ('PENDING', 'SYNCING', 'FAILED')")
    suspend fun getPendingCount(): Int

    @Query("SELECT COUNT(*) FROM collector_events WHERE status IN ('PENDING', 'SYNCING', 'FAILED')")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT * FROM collector_events ORDER BY created_at DESC LIMIT :limit OFFSET :offset")
    fun observeRecentEvents(limit: Int = 50, offset: Int = 0): Flow<List<CollectorEventEntity>>

    @Query("SELECT * FROM collector_events ORDER BY created_at DESC")
    fun getAllEvents(): Flow<List<CollectorEventEntity>>

    @Transaction
    suspend fun resetSyncingToPending() {
        resetSyncingToPendingInternal()
    }

    @Query("UPDATE collector_events SET status = 'PENDING' WHERE status = 'SYNCING'")
    suspend fun resetSyncingToPendingInternal(): Int
}
