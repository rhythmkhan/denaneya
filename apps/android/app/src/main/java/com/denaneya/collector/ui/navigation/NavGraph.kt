package com.denaneya.collector.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.denaneya.collector.ui.screens.dashboard.DashboardScreen
import com.denaneya.collector.ui.screens.events.EventLogScreen
import com.denaneya.collector.ui.screens.pairing.PairingScreen
import com.denaneya.collector.ui.screens.settings.SettingsScreen

@Composable
fun CollectorNavGraph(
    navController: NavHostController,
    isDevicePaired: Boolean,
    modifier: Modifier = Modifier
) {
    val startDestination = if (isDevicePaired) Screen.Dashboard.route else Screen.Pairing.route

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(Screen.Dashboard.route) {
            DashboardScreen(
                onNavigateToPairing = { navController.navigate(Screen.Pairing.route) },
                onNavigateToLogs = { navController.navigate(Screen.EventLog.route) },
                onNavigateToSettings = { navController.navigate(Screen.Settings.route) }
            )
        }

        composable(Screen.Pairing.route) {
            PairingScreen(
                onPairingSuccess = {
                    navController.navigate(Screen.Dashboard.route) {
                        popUpTo(Screen.Pairing.route) { inclusive = true }
                    }
                },
                onCancel = {
                    if (isDevicePaired) {
                        navController.popBackStack()
                    }
                }
            )
        }

        composable(Screen.EventLog.route) {
            EventLogScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onUnpaired = {
                    navController.navigate(Screen.Pairing.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
