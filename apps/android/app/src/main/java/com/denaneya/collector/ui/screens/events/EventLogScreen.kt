package com.denaneya.collector.ui.screens.events

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.denaneya.collector.data.local.CollectorEventEntity
import com.denaneya.collector.ui.components.ProviderBadge
import com.denaneya.collector.ui.components.StatusBadge
import com.denaneya.collector.ui.theme.EmeraldOnPrimaryContainerLight
import com.denaneya.collector.ui.theme.EmeraldPrimaryContainerLight
import com.denaneya.collector.ui.theme.EmeraldPrimaryLight
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventLogScreen(
    viewModel: EventLogViewModel = viewModel(),
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedEventForDetail by remember { mutableStateOf<CollectorEventEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Event Logs & Audit", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
            // Search Input
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.onSearchQueryChanged(it) },
                placeholder = { Text("Search by TrxID, MSISDN, or content...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                singleLine = true
            )

            // Provider Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = uiState.selectedProvider == null,
                    onClick = { viewModel.onProviderSelected(null) },
                    label = { Text("All Providers") }
                )
                listOf("bKash", "Nagad", "Rocket", "Upay").forEach { provider ->
                    FilterChip(
                        selected = uiState.selectedProvider.equals(provider, ignoreCase = true),
                        onClick = { viewModel.onProviderSelected(provider) },
                        label = { Text(provider) }
                    )
                }
            }

            // Status Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = uiState.selectedStatus == null,
                    onClick = { viewModel.onStatusSelected(null) },
                    label = { Text("All Statuses") }
                )
                listOf("PENDING", "SYNCED", "FAILED").forEach { status ->
                    FilterChip(
                        selected = uiState.selectedStatus.equals(status, ignoreCase = true),
                        onClick = { viewModel.onStatusSelected(status) },
                        label = { Text(status) }
                    )
                }
            }

            // Scrollable Event List
            if (uiState.events.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No captured events matching filter.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(
                        items = uiState.events,
                        key = { it.id }
                    ) { event ->
                        EventItemCard(
                            event = event,
                            onClick = { selectedEventForDetail = event }
                        )
                    }
                }
            }
        }
    }

    selectedEventForDetail?.let { event ->
        EventDetailDialog(
            event = event,
            onDismiss = { selectedEventForDetail = null },
            onRetrySync = {
                viewModel.retrySync(event.id)
                selectedEventForDetail = null
            }
        )
    }
}

@Composable
fun EventItemCard(
    event: CollectorEventEntity,
    onClick: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()) }
    val timeFormatted = dateFormat.format(Date(event.timestamp))

    val (statusBg, statusFg) = when (event.status) {
        "SYNCED" -> Pair(EmeraldPrimaryContainerLight, EmeraldOnPrimaryContainerLight)
        "PENDING", "SYNCING" -> Pair(Color(0xFFFEF3C7), Color(0xFF92400E))
        else -> Pair(Color(0xFFFEE2E2), Color(0xFF991B1B))
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ProviderBadge(provider = event.sender)
                    Text(
                        text = "SIM ${event.simSlot + 1}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                StatusBadge(text = event.status, containerColor = statusBg, contentColor = statusFg)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = event.rawMessage,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = event.sequenceNumber?.let { "Seq #$it" } ?: "Seq: Pending",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = timeFormatted,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun EventDetailDialog(
    event: CollectorEventEntity,
    onDismiss: () -> Unit,
    onRetrySync: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Event Audit Detail", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Provider:", fontWeight = FontWeight.SemiBold)
                    Text(event.sender)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Sequence #:", fontWeight = FontWeight.SemiBold)
                    Text(event.sequenceNumber?.toString() ?: "Pending (offline)")
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Nonce:", fontWeight = FontWeight.SemiBold)
                    Text(event.nonce?.take(18)?.let { "$it..." } ?: "Pending (offline)")
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Timestamp:", fontWeight = FontWeight.SemiBold)
                    Text(dateFormat.format(Date(event.timestamp)))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Status:", fontWeight = FontWeight.SemiBold)
                    Text(event.status)
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))

                Text("Raw Payload:", fontWeight = FontWeight.SemiBold)
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9)),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = event.rawMessage,
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        modifier = Modifier.padding(8.dp)
                    )
                }

                if (event.errorMessage != null) {
                    Text(
                        text = "Error: ${event.errorMessage}",
                        color = Color.Red,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            if (event.status != "SYNCED") {
                Button(
                    onClick = onRetrySync,
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Text("Retry Sync", modifier = Modifier.padding(start = 6.dp))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}
