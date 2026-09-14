package com.denaneya.collector.ui.screens.pairing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.denaneya.collector.security.PairingManager
import com.denaneya.collector.security.models.PairingQrPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

data class PairingUiState(
    val isProcessing: Boolean = false,
    val processingMessage: String = "",
    val pairingSuccess: Boolean = false,
    val errorMessage: String? = null
)

class PairingViewModel(application: Application) : AndroidViewModel(application) {

    private val pairingManager = PairingManager(application)

    private val _uiState = MutableStateFlow(PairingUiState())
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    fun processPairingPayload(qrContent: String) {
        if (_uiState.value.isProcessing) return

        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true, processingMessage = "Validating pairing token...", errorMessage = null) }

            val validationResult = pairingManager.parseAndValidateQr(qrContent)
            if (validationResult.isFailure) {
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        errorMessage = validationResult.exceptionOrNull()?.message ?: "Invalid QR payload."
                    )
                }
                return@launch
            }

            val payload = validationResult.getOrThrow()
            performPairing(payload)
        }
    }

    fun pairManually(serverUrl: String, merchantId: String, deviceId: String, token: String) {
        if (_uiState.value.isProcessing) return

        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true, processingMessage = "Preparing registration...", errorMessage = null) }

            val cleanUrl = serverUrl.trim().trimEnd('/')
            if (cleanUrl.isBlank() || merchantId.isBlank() || deviceId.isBlank() || token.isBlank()) {
                _uiState.update {
                    it.copy(isProcessing = false, errorMessage = "All fields are mandatory.")
                }
                return@launch
            }

            // Default expiry 10 minutes from now for manual pairing
            val expiresAt = Instant.now().plus(10, ChronoUnit.MINUTES).toString()
            val payload = PairingQrPayload(
                serverUrl = cleanUrl,
                merchantId = merchantId.trim(),
                deviceId = deviceId.trim(),
                pairingToken = token.trim(),
                expiresAt = expiresAt
            )

            performPairing(payload)
        }
    }

    private suspend fun performPairing(payload: PairingQrPayload) {
        _uiState.update { it.copy(processingMessage = "Generating hardware EC P-256 key...") }

        when (val result = pairingManager.executePairing(payload)) {
            is PairingManager.PairingResult.Success -> {
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        pairingSuccess = true,
                        errorMessage = null
                    )
                }
            }
            is PairingManager.PairingResult.Error -> {
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
