package com.denaneya.collector.security

import kotlinx.coroutines.sync.Mutex

/**
 * Process-wide transmission coordinator ensuring atomic sequence allocation
 * and wire dispatch across SmsSyncWorker and HeartbeatWorker.
 *
 * Guarantees that request N+1 cannot allocate sequence N+1 or transmit
 * until request N has completed its wire roundtrip and updated local state.
 */
object DispatchCoordinator {
    val transmissionMutex = Mutex()
}
