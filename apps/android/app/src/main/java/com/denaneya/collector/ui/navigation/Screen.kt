package com.denaneya.collector.ui.navigation

sealed class Screen(val route: String) {
    data object Dashboard : Screen("dashboard")
    data object Pairing : Screen("pairing")
    data object EventLog : Screen("event_log")
    data object Settings : Screen("settings")
}
