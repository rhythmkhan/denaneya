package com.denaneya.collector.ui.screens.dashboard

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.denaneya.collector.data.local.CollectorDatabase
import com.denaneya.collector.security.SecureStorage
import com.denaneya.collector.worker.SmsSyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DashboardUiState(
    val isPaired: Boolean = false,
    val isCollectorActive: Boolean = false,
    val lastHeartbeatRelative: String = "Never",
    val batteryLevel: Int = 100,
    val isCharging: Boolean = false,
    val networkType: String = "Unknown",
    val merchantId: String = "Unassigned",
    val deviceName: String = "Collector Device",
    val deviceId: String = "Unpaired",
    val sequenceNumber: Long = 0L,
    val pendingQueueCount: Int = 0,
    val isSyncing: Boolean = false
)

class DashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val secureStorage = SecureStorage.getInstance(application)
    private val database = CollectorDatabase.getInstance(application)
    private val workManager = WorkManager.getInstance(application)

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadState()
        observePendingCount()
    }

    fun loadState() {
        val isPaired = secureStorage.isPaired()
        val deviceId = secureStorage.getDeviceId() ?: "Unpaired"
        val merchantId = secureStorage.getMerchantId() ?: "Unassigned"
        val deviceName = secureStorage.getDeviceName()
        val seq = secureStorage.getSequenceNumber()
        val lastHb = secureStorage.getLastHeartbeatAt()

        val isCollectorActive = isPaired && (System.currentTimeMillis() - lastHb < 25 * 60 * 1000)
        val relativeHb = if (lastHb > 0) {
            val minutes = (System.currentTimeMillis() - lastHb) / (60 * 1000)
            if (minutes < 1) "Just now" else "$minutes min ago"
        } else {
            "Never"
        }

        val battery = getBatteryInfo()
        val network = getNetworkType()

        _uiState.update {
            it.copy(
                isPaired = isPaired,
                isCollectorActive = isCollectorActive,
                lastHeartbeatRelative = relativeHb,
                batteryLevel = battery.first,
                isCharging = battery.second,
                networkType = network,
                merchantId = merchantId,
                deviceName = deviceName,
                deviceId = deviceId,
                sequenceNumber = seq
            )
        }
    }

    private fun observePendingCount() {
        viewModelScope.launch {
            database.collectorEventDao().observePendingCount().collect { count ->
                _uiState.update { it.copy(pendingQueueCount = count) }
            }
        }
    }

    fun triggerManualSync() {
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

    private fun getBatteryInfo(): Pair<Int, Boolean> {
        val context = getApplication<Application>()
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
        val pct = if (level >= 0 && scale > 0) (level * 100) / scale else 100
        return Pair(pct, isCharging)
    }

    private fun getNetworkType(): String {
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return "OFFLINE"
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return "OFFLINE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "OTHER"
        }
    }
}
