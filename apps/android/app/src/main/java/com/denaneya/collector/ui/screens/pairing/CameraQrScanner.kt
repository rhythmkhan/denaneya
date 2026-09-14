package com.denaneya.collector.ui.screens.pairing

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.denaneya.collector.ui.theme.EmeraldPrimaryLight
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "CameraQrScanner"

@Composable
fun CameraQrScanner(
    modifier: Modifier = Modifier,
    onQrScanned: (String) -> Unit
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    if (hasCameraPermission) {
        CameraPreviewWithScanner(
            modifier = modifier,
            onQrScanned = onQrScanned
        )
    } else {
        CameraPermissionPrompt(
            onRequestPermission = {
                permissionLauncher.launch(Manifest.permission.CAMERA)
            },
            modifier = modifier
        )
    }
}

@Composable
private fun CameraPermissionPrompt(
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(Color(0xFF0F172A), shape = RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFF334155), shape = RoundedCornerShape(16.dp))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.CameraAlt,
                contentDescription = "Camera Permission",
                tint = EmeraldPrimaryLight,
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Camera Permission Required",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Allow camera access to scan the pairing QR code displayed on the DenaNeya Merchant Dashboard.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(
                onClick = onRequestPermission,
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimaryLight)
            ) {
                Text("Allow Camera Access", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun CameraPreviewWithScanner(
    modifier: Modifier = Modifier,
    onQrScanned: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanned = remember { AtomicBoolean(false) }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black)
    ) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }

                    val imageAnalysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()

                    imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImageProxy(imageProxy, scanned) { qrText ->
                            Log.d(TAG, "QR code decoded: ${qrText.take(40)}...")
                            // Post result to main thread
                            previewView.post {
                                onQrScanned(qrText)
                            }
                        }
                    }

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageAnalysis
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Camera binding failed", e)
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Viewfinder Target Overlay
        ScannerOverlay(modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun ScannerOverlay(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val strokeWidth = 3.dp.toPx()
        val cornerLength = 24.dp.toPx()
        val boxWidth = size.width * 0.75f
        val boxHeight = boxWidth
        val left = (size.width - boxWidth) / 2f
        val top = (size.height - boxHeight) / 2f
        val right = left + boxWidth
        val bottom = top + boxHeight

        val color = Color(0xFF10B981)

        // Top-left corner
        drawLine(color, Offset(left, top), Offset(left + cornerLength, top), strokeWidth)
        drawLine(color, Offset(left, top), Offset(left, top + cornerLength), strokeWidth)

        // Top-right corner
        drawLine(color, Offset(right, top), Offset(right - cornerLength, top), strokeWidth)
        drawLine(color, Offset(right, top), Offset(right, top + cornerLength), strokeWidth)

        // Bottom-left corner
        drawLine(color, Offset(left, bottom), Offset(left + cornerLength, bottom), strokeWidth)
        drawLine(color, Offset(left, bottom), Offset(left, bottom - cornerLength), strokeWidth)

        // Bottom-right corner
        drawLine(color, Offset(right, bottom), Offset(right - cornerLength, bottom), strokeWidth)
        drawLine(color, Offset(right, bottom), Offset(right, bottom - cornerLength), strokeWidth)
    }
}

private fun processImageProxy(
    image: ImageProxy,
    scanned: AtomicBoolean,
    onSuccess: (String) -> Unit
) {
    if (scanned.get()) {
        image.close()
        return
    }

    try {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val width = image.width
        val height = image.height

        val data: ByteArray
        if (rowStride == width) {
            data = ByteArray(buffer.remaining())
            buffer.get(data)
        } else {
            data = ByteArray(width * height)
            val rowBuffer = ByteArray(rowStride)
            for (row in 0 until height) {
                val bytesToRead = minOf(rowStride, buffer.remaining())
                buffer.get(rowBuffer, 0, bytesToRead)
                System.arraycopy(rowBuffer, 0, data, row * width, width)
            }
        }

        val rotation = image.imageInfo.rotationDegrees
        val source = createRotatedLuminanceSource(data, width, height, rotation)
        val bitmap = BinaryBitmap(HybridBinarizer(source))

        val hints = mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            DecodeHintType.TRY_HARDER to true
        )
        val reader = MultiFormatReader().apply { setHints(hints) }

        try {
            val result = reader.decodeWithState(bitmap)
            if (scanned.compareAndSet(false, true)) {
                onSuccess(result.text)
            }
        } catch (_: Exception) {
            // QR not in current frame
        } finally {
            reader.reset()
        }
    } catch (e: Exception) {
        Log.e(TAG, "Image analysis error", e)
    } finally {
        image.close()
    }
}

private fun createRotatedLuminanceSource(
    data: ByteArray,
    width: Int,
    height: Int,
    rotation: Int
): PlanarYUVLuminanceSource {
    return when (rotation) {
        90 -> {
            val rotated = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    rotated[x * height + height - y - 1] = data[x + y * width]
                }
            }
            PlanarYUVLuminanceSource(rotated, height, width, 0, 0, height, width, false)
        }
        180 -> {
            val rotated = ByteArray(data.size)
            for (i in data.indices) {
                rotated[data.size - 1 - i] = data[i]
            }
            PlanarYUVLuminanceSource(rotated, width, height, 0, 0, width, height, false)
        }
        270 -> {
            val rotated = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    rotated[(width - x - 1) * height + y] = data[x + y * width]
                }
            }
            PlanarYUVLuminanceSource(rotated, height, width, 0, 0, height, width, false)
        }
        else -> {
            PlanarYUVLuminanceSource(data, width, height, 0, 0, width, height, false)
        }
    }
}
