package com.denaneya.collector.ui.screens.events

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.data.local.CollectorEventEntity
import com.denaneya.collector.worker.SmsSyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class EventLogUiState(
    val events: List<CollectorEventEntity> = emptyList(),
    val selectedProvider: String? = null,
    val selectedStatus: String? = null,
    val searchQuery: String = ""
)

class EventLogViewModel(application: Application) : AndroidViewModel(application) {

    private val db = CollectorDatabase.getInstance(application)
    private val dao = db.collectorEventDao()
    private val workManager = WorkManager.getInstance(application)

    private val _selectedProvider = MutableStateFlow<String?>(null)
    private val _selectedStatus = MutableStateFlow<String?>(null)
    private val _searchQuery = MutableStateFlow("")

    val uiState: StateFlow<EventLogUiState> = combine(
        dao.getAllEvents(),
        _selectedProvider,
        _selectedStatus,
        _searchQuery
    ) { allEvents, provider, status, query ->
        val filtered = allEvents.filter { event ->
            val matchesProvider = when (provider?.uppercase()) {
                null -> true
                "BKASH" -> event.sender.contains("bKash", ignoreCase = true) || event.sender.contains("16247")
                "NAGAD" -> event.sender.contains("Nagad", ignoreCase = true) || event.sender.contains("16167")
                "ROCKET" -> event.sender.contains("Rocket", ignoreCase = true) || event.sender.contains("16216") || event.sender.contains("DBBL", ignoreCase = true)
                "UPAY" -> event.sender.contains("Upay", ignoreCase = true) || event.sender.contains("16268") || event.sender.contains("UCB", ignoreCase = true)
                else -> true
            }

            val matchesStatus = if (status == null) true else event.status.equals(status, ignoreCase = true)

            val matchesQuery = if (query.isBlank()) {
                true
            } else {
                event.rawMessage.contains(query, ignoreCase = true) ||
                        event.sender.contains(query, ignoreCase = true) ||
                        (event.nonce?.contains(query, ignoreCase = true) == true) ||
                        (event.sequenceNumber?.toString()?.contains(query) == true)
            }

            matchesProvider && matchesStatus && matchesQuery
        }

        EventLogUiState(
            events = filtered,
            selectedProvider = provider,
            selectedStatus = status,
            searchQuery = query
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = EventLogUiState()
    )

    fun onProviderSelected(provider: String?) {
        _selectedProvider.value = provider
    }

    fun onStatusSelected(status: String?) {
        _selectedStatus.value = status
    }

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun retrySync(eventId: String) {
        viewModelScope.launch {
            dao.markEventsFailed(listOf(eventId), "Manual retry requested")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<SmsSyncWorker>()
                .setConstraints(constraints)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()

            workManager.enqueueUniqueWork(
                "DenaNeyaExpeditedSmsSync",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }
    }
}
