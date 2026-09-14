package com.denaneya.collector.ui.screens.settings

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import com.denaneya.collector.security.KeyStoreHelper
import com.denaneya.collector.security.SecureStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class SettingsUiState(
    val serverUrl: String = "https://api.denaneya.com",
    val isPaired: Boolean = false,
    val deviceId: String = "Unpaired",
    val merchantId: String = "Unassigned",
    val keyAlias: String = KeyStoreHelper.DEFAULT_KEY_ALIAS,
    val publicKeyHexPreview: String = "Not Generated",
    val hasSmsPermission: Boolean = false,
    val hasCameraPermission: Boolean = false,
    val isIgnoringBatteryOptimizations: Boolean = false
)

class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val secureStorage = SecureStorage.getInstance(application)

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        refreshState()
    }

    fun refreshState() {
        val context = getApplication<Application>()
        val isPaired = secureStorage.isPaired()
        val serverUrl = secureStorage.getServerUrl()
        val deviceId = secureStorage.getDeviceId() ?: "Unpaired"
        val merchantId = secureStorage.getMerchantId() ?: "Unassigned"

        val hasKey = KeyStoreHelper.hasKey()
        val pubKeyHex = if (hasKey) {
            try {
                val fullHex = KeyStoreHelper.exportPublicKeyHex()
                if (fullHex.length >= 32) {
                    "${fullHex.take(16)}...${fullHex.takeLast(16)} (${fullHex.length} hex chars)"
                } else {
                    fullHex
                }
            } catch (_: Exception) {
                "Key Load Error"
            }
        } else {
            "No Key in Keystore"
        }

        val hasSms = ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
        val hasCamera = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val isIgnoringBattery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        } else {
            true
        }

        _uiState.update {
            it.copy(
                serverUrl = serverUrl,
                isPaired = isPaired,
                deviceId = deviceId,
                merchantId = merchantId,
                publicKeyHexPreview = pubKeyHex,
                hasSmsPermission = hasSms,
                hasCameraPermission = hasCamera,
                isIgnoringBatteryOptimizations = isIgnoringBattery
            )
        }
    }

    fun updateServerUrl(newUrl: String) {
        secureStorage.setServerUrl(newUrl.trim())
        refreshState()
    }

    fun unpairDevice() {
        KeyStoreHelper.deleteKey()
        secureStorage.clearPairing()
        refreshState()
    }
}
