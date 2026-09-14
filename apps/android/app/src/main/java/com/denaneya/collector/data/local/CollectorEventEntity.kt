package com.denaneya.collector.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "collector_events",
    indices = [
        Index(value = ["status"]),
        Index(value = ["created_at"]),
        Index(value = ["sequence_number"]),
        Index(value = ["nonce"])
    ]
)
data class CollectorEventEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String, // e.g. "evt_4f82a9b1c7e6..."

    @ColumnInfo(name = "sequence_number")
    val sequenceNumber: Long? = null, // Wire sequence allocated at transmission time (null while PENDING)

    @ColumnInfo(name = "nonce")
    val nonce: String? = null, // Anti-replay nonce allocated at transmission time (null while PENDING)

    @ColumnInfo(name = "timestamp")
    val timestamp: Long, // Originating receipt timestamp (Epoch ms) -> wire payload.receivedAt

    @ColumnInfo(name = "event_type")
    val eventType: String, // "SMS_RECEIVED", "NOTIFICATION_RECEIVED", "HEARTBEAT"

    @ColumnInfo(name = "sender")
    val sender: String, // e.g. "bKash", "16247", "Nagad"

    @ColumnInfo(name = "raw_message")
    val rawMessage: String, // Verbatim SMS / notification body

    @ColumnInfo(name = "sim_slot", defaultValue = "0")
    val simSlot: Int = 0, // 0 or 1

    @ColumnInfo(name = "status")
    val status: String = "PENDING", // "PENDING", "SYNCING", "SYNCED", "FAILED"

    @ColumnInfo(name = "retry_count", defaultValue = "0")
    val retryCount: Int = 0,

    @ColumnInfo(name = "error_message")
    val errorMessage: String? = null,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(), // Local insertion time (Epoch ms) for strict FIFO

    @ColumnInfo(name = "synced_at")
    val syncedAt: Long? = null // Server acknowledgement time (Epoch ms)
)
