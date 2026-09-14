package com.denaneya.collector.ui.screens.pairing

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.denaneya.collector.ui.theme.EmeraldPrimaryLight
import com.denaneya.collector.ui.theme.StatusError
import com.denaneya.collector.ui.theme.StatusSuccess

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PairingScreen(
    viewModel: PairingViewModel = viewModel(),
    onPairingSuccess: () -> Unit,
    onCancel: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Device Pairing", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Scan QR Code") },
                    icon = { Icon(Icons.Default.QrCodeScanner, contentDescription = null) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Manual Entry") },
                    icon = { Icon(Icons.Default.Keyboard, contentDescription = null) }
                )
            }

            when (selectedTab) {
                0 -> QrScannerTab(
                    onQrScanned = { payload -> viewModel.processPairingPayload(payload) },
                    isProcessing = uiState.isProcessing
                )
                1 -> ManualEntryTab(
                    onPairSubmit = { serverUrl, merchantId, deviceId, token ->
                        viewModel.pairManually(serverUrl, merchantId, deviceId, token)
                    },
                    isProcessing = uiState.isProcessing
                )
            }
        }
    }

    // Success and Processing Dialogs
    if (uiState.isProcessing) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Registering Hardware Key") },
            text = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp), color = EmeraldPrimaryLight)
                    Text(
                        text = uiState.processingMessage,
                        modifier = Modifier.padding(start = 16.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            },
            confirmButton = {}
        )
    }

    if (uiState.pairingSuccess) {
        AlertDialog(
            onDismissRequest = onPairingSuccess,
            icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusSuccess, modifier = Modifier.size(48.dp)) },
            title = { Text("Terminal Paired Successfully", textAlign = TextAlign.Center) },
            text = {
                Text(
                    "Your device is now bound to the merchant account via hardware EC P-256 keys. Background SMS ingestion is active.",
                    textAlign = TextAlign.Center
                )
            },
            confirmButton = {
                Button(
                    onClick = onPairingSuccess,
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight)
                ) {
                    Text("Go to Dashboard")
                }
            }
        )
    }

    uiState.errorMessage?.let { error ->
        AlertDialog(
            onDismissRequest = { viewModel.clearError() },
            icon = { Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = StatusError, modifier = Modifier.size(48.dp)) },
            title = { Text("Pairing Failed") },
            text = { Text(error) },
            confirmButton = {
                TextButton(onClick = { viewModel.clearError() }) {
                    Text("OK")
                }
            }
        )
    }
}

@Composable
fun QrScannerTab(
    onQrScanned: (String) -> Unit,
    isProcessing: Boolean
) {
    var rawQrInput by remember { mutableStateOf("") }
    var showManualFallback by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Real Live Camera Preview with ZXing Barcode Scanning
        CameraQrScanner(
            modifier = Modifier
                .fillMaxWidth()
                .height(340.dp),
            onQrScanned = onQrScanned
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Align the QR code from the DenaNeya Merchant Dashboard within the viewfinder frame.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF64748B),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        TextButton(onClick = { showManualFallback = !showManualFallback }) {
            Text(if (showManualFallback) "Hide Manual Payload Entry" else "Or paste QR payload manually")
        }

        if (showManualFallback) {
            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = rawQrInput,
                onValueChange = { rawQrInput = it },
                label = { Text("Paste QR JSON payload") },
                placeholder = { Text("{\"serverUrl\":...,\"pairingToken\":...}") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 4
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { if (rawQrInput.isNotBlank()) onQrScanned(rawQrInput) },
                enabled = rawQrInput.isNotBlank() && !isProcessing,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight)
            ) {
                Text("Process Pasted QR Data")
            }
        }
    }
}

@Composable
fun ManualEntryTab(
    onPairSubmit: (serverUrl: String, merchantId: String, deviceId: String, token: String) -> Unit,
    isProcessing: Boolean
) {
    var serverUrl by remember { mutableStateOf("https://api.denaneya.com") }
    var merchantId by remember { mutableStateOf("") }
    var deviceId by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Manual Terminal Credentials",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Enter terminal parameters from the DenaNeya Merchant Settings > Devices panel.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = merchantId,
            onValueChange = { merchantId = it },
            label = { Text("Merchant ID (e.g. mch_...)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = deviceId,
            onValueChange = { deviceId = it },
            label = { Text("Device ID (e.g. dev_...)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = token,
            onValueChange = { token = it },
            label = { Text("Pairing Token (pair_...)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = { onPairSubmit(serverUrl, merchantId, deviceId, token) },
            enabled = !isProcessing && merchantId.isNotBlank() && deviceId.isNotBlank() && token.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight)
        ) {
            Text("Complete Pairing Handshake")
        }
    }
}
