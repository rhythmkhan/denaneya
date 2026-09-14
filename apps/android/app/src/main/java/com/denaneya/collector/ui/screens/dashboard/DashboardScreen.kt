package com.denaneya.collector.ui.screens.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.BatteryStd
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.denaneya.collector.ui.components.DenaNeyaTopBar
import com.denaneya.collector.ui.components.PulseRadarIndicator
import com.denaneya.collector.ui.components.StatusBadge
import com.denaneya.collector.ui.components.TelemetryItem
import com.denaneya.collector.ui.theme.EmeraldOnPrimaryContainerLight
import com.denaneya.collector.ui.theme.EmeraldPrimaryContainerLight
import com.denaneya.collector.ui.theme.EmeraldPrimaryLight
import com.denaneya.collector.ui.theme.MfsBkash
import com.denaneya.collector.ui.theme.MfsBkashBackground
import com.denaneya.collector.ui.theme.MfsNagad
import com.denaneya.collector.ui.theme.MfsNagadBackground
import com.denaneya.collector.ui.theme.MfsRocket
import com.denaneya.collector.ui.theme.MfsRocketBackground
import com.denaneya.collector.ui.theme.MfsUpay
import com.denaneya.collector.ui.theme.MfsUpayBackground
import com.denaneya.collector.ui.theme.StatusError
import com.denaneya.collector.ui.theme.StatusSuccess
import com.denaneya.collector.ui.theme.StatusWarning

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = viewModel(),
    onNavigateToPairing: () -> Unit,
    onNavigateToLogs: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.loadState()
    }

    Scaffold(
        topBar = {
            DenaNeyaTopBar(
                title = "DenaNeya Collector",
                subtitle = "দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।",
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(modifier = Modifier.height(4.dp)) }

            // 1. Unpaired Banner
            if (!uiState.isPaired) {
                item {
                    UnpairedWarningCard(onPairClick = onNavigateToPairing)
                }
            }

            // 2. Collector Liveness Radar & Telemetry Card
            item {
                CollectorLivenessCard(
                    isActive = uiState.isCollectorActive,
                    lastHeartbeat = uiState.lastHeartbeatRelative,
                    batteryLevel = uiState.batteryLevel,
                    isCharging = uiState.isCharging,
                    networkType = uiState.networkType
                )
            }

            // 3. Merchant & Device Identity Card
            item {
                MerchantInfoCard(
                    merchantId = uiState.merchantId,
                    deviceName = uiState.deviceName,
                    deviceId = uiState.deviceId,
                    sequenceNumber = uiState.sequenceNumber
                )
            }

            // 4. Pending Queue & Sync Action Card
            item {
                PendingQueueCard(
                    pendingCount = uiState.pendingQueueCount,
                    isSyncing = uiState.isSyncing,
                    onSyncNow = { viewModel.triggerManualSync() },
                    onViewLogs = onNavigateToLogs
                )
            }

            // 5. Monitored Gateways Grid
            item {
                Text(
                    text = "Monitored Payment Gateways",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 4.dp, bottom = 4.dp)
                )
                MonitoredGatewaysGrid()
            }

            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

@Composable
fun UnpairedWarningCard(onPairClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
        border = BorderStroke(1.dp, Color(0xFFFECACA))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, contentDescription = null, tint = StatusError)
                Text(
                    text = "Device Not Paired",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF991B1B),
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
            Text(
                text = "This terminal is not paired with a DenaNeya merchant account. Scan the pairing QR code from your web dashboard to activate automated SMS ingestion.",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF7F1D1D),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            Button(
                onClick = onPairClick,
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.QrCode, contentDescription = null)
                Text("Scan Pairing QR", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
fun CollectorLivenessCard(
    isActive: Boolean,
    lastHeartbeat: String,
    batteryLevel: Int,
    isCharging: Boolean,
    networkType: String
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    PulseRadarIndicator(isActive = isActive)
                    Column {
                        Text(
                            text = if (isActive) "Collector Active" else "Collector Offline",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isActive) StatusSuccess else StatusWarning
                        )
                        Text(
                            text = "Last Heartbeat: $lastHeartbeat",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                StatusBadge(
                    text = if (isActive) "LIVE" else "STALE",
                    containerColor = if (isActive) EmeraldPrimaryContainerLight else Color(0xFFFEF3C7),
                    contentColor = if (isActive) EmeraldOnPrimaryContainerLight else Color(0xFF92400E)
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 12.dp),
                color = MaterialTheme.colorScheme.outline
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TelemetryItem(
                    icon = if (isCharging) Icons.Default.BatteryChargingFull else Icons.Default.BatteryStd,
                    label = "$batteryLevel% ${if (isCharging) "(Charging)" else ""}"
                )
                TelemetryItem(
                    icon = Icons.Default.Wifi,
                    label = networkType
                )
                TelemetryItem(
                    icon = Icons.Default.Security,
                    label = "EC P-256"
                )
            }
        }
    }
}

@Composable
fun MerchantInfoCard(
    merchantId: String,
    deviceName: String,
    deviceId: String,
    sequenceNumber: Long
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Terminal Binding",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Seq: #$sequenceNumber",
                    style = MaterialTheme.typography.labelSmall,
                    color = EmeraldPrimaryLight,
                    fontWeight = FontWeight.Bold
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Merchant ID:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(merchantId, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Device Name:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(deviceName, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Device ID:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(deviceId, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
fun PendingQueueCard(
    pendingCount: Int,
    isSyncing: Boolean,
    onSyncNow: () -> Unit,
    onViewLogs: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Offline Queue",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "$pendingCount events waiting to sync",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (pendingCount > 0) StatusWarning else StatusSuccess
                    )
                }
                StatusBadge(
                    text = "$pendingCount PENDING",
                    containerColor = if (pendingCount > 0) Color(0xFFFEF3C7) else EmeraldPrimaryContainerLight,
                    contentColor = if (pendingCount > 0) Color(0xFF92400E) else EmeraldOnPrimaryContainerLight
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onSyncNow,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight),
                    enabled = !isSyncing
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Text("Sync Now", modifier = Modifier.padding(start = 6.dp))
                }
                OutlinedButton(
                    onClick = onViewLogs,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("View Logs")
                    Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}

@Composable
fun MonitoredGatewaysGrid() {
    val gateways = listOf(
        GatewayInfo("bKash", "16247", MfsBkashBackground, MfsBkash),
        GatewayInfo("Nagad", "16167", MfsNagadBackground, MfsNagad),
        GatewayInfo("Rocket", "16216", MfsRocketBackground, MfsRocket),
        GatewayInfo("Upay", "16268", MfsUpayBackground, MfsUpay)
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GatewayCard(gateways[0], Modifier.weight(1f))
            GatewayCard(gateways[1], Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GatewayCard(gateways[2], Modifier.weight(1f))
            GatewayCard(gateways[3], Modifier.weight(1f))
        }
    }
}

data class GatewayInfo(val name: String, val shortcode: String, val bgColor: Color, val brandColor: Color)

@Composable
fun GatewayCard(gateway: GatewayInfo, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = gateway.bgColor),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = gateway.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = gateway.brandColor
                )
                Text(
                    text = "Shortcode: ${gateway.shortcode}",
                    style = MaterialTheme.typography.labelSmall,
                    color = gateway.brandColor.copy(alpha = 0.8f)
                )
            }
            Icon(Icons.Default.CheckCircle, contentDescription = "Active", tint = gateway.brandColor)
        }
    }
}
