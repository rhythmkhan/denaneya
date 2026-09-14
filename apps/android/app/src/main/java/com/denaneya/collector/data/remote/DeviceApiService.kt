package com.denaneya.collector.data.remote

import com.denaneya.collector.security.models.CollectorSubmissionEnvelope
import com.denaneya.collector.security.models.HeartbeatPayload
import com.denaneya.collector.security.models.HeartbeatResponseDto
import com.denaneya.collector.security.models.PairingRequestDto
import com.denaneya.collector.security.models.PairingResponseDto
import com.denaneya.collector.security.models.SmsPayload
import com.denaneya.collector.security.models.SmsResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface DeviceApiService {

    @POST("api/v1/devices/pair")
    suspend fun pairDevice(
        @Body request: PairingRequestDto
    ): Response<PairingResponseDto>

    @POST("api/v1/devices/sms")
    suspend fun submitSmsEvent(
        @Body request: CollectorSubmissionEnvelope<SmsPayload>
    ): Response<SmsResponseDto>

    @POST("api/v1/devices/heartbeat")
    suspend fun submitHeartbeat(
        @Body request: CollectorSubmissionEnvelope<HeartbeatPayload>
    ): Response<HeartbeatResponseDto>
}
