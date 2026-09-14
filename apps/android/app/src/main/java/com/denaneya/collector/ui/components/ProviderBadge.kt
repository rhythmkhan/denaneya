package com.denaneya.collector.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.denaneya.collector.ui.theme.MfsBkash
import com.denaneya.collector.ui.theme.MfsBkashBackground
import com.denaneya.collector.ui.theme.MfsNagad
import com.denaneya.collector.ui.theme.MfsNagadBackground
import com.denaneya.collector.ui.theme.MfsRocket
import com.denaneya.collector.ui.theme.MfsRocketBackground
import com.denaneya.collector.ui.theme.MfsUpay
import com.denaneya.collector.ui.theme.MfsUpayBackground

@Composable
fun ProviderBadge(
    provider: String,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor, label) = when (provider.uppercase()) {
        "BKASH", "16247" -> Triple(MfsBkashBackground, MfsBkash, "bKash")
        "NAGAD", "16167" -> Triple(MfsNagadBackground, MfsNagad, "Nagad")
        "ROCKET", "16216", "DBBL" -> Triple(MfsRocketBackground, MfsRocket, "Rocket")
        "UPAY", "16268", "UCB" -> Triple(MfsUpayBackground, MfsUpay, "Upay")
        else -> Triple(Color(0xFFE2E8F0), Color(0xFF475569), provider)
    }

    Box(
        modifier = modifier
            .background(color = bgColor, shape = RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}
