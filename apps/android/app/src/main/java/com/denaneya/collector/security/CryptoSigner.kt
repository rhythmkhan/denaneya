package com.denaneya.collector.security

import android.content.Context
import java.nio.charset.StandardCharsets
import java.util.Base64

/**
 * Signs deterministic Canonical JSON payloads using hardware-backed EC P-256 keys.
 * Produces standard ASN.1 DER ECDSA signatures encoded in Base64.
 */
class CryptoSigner(
    private val context: Context? = null,
    private val keyAlias: String = KeyStoreHelper.DEFAULT_KEY_ALIAS
) {

    /**
     * Signs a canonical JSON string with the hardware private key.
     * Returns the ASN.1 DER signature as a Base64 string.
     */
    fun signCanonicalJson(canonicalJson: String): String {
        val dataBytes = canonicalJson.toByteArray(StandardCharsets.UTF_8)
        val derSignature = KeyStoreHelper.signData(dataBytes, keyAlias)
        return Base64.getEncoder().encodeToString(derSignature)
    }

    /**
     * Verifies a canonical JSON string signature.
     */
    fun verifySignature(canonicalJson: String, signatureBase64: String): Boolean {
        return try {
            val dataBytes = canonicalJson.toByteArray(StandardCharsets.UTF_8)
            val derBytes = Base64.getDecoder().decode(signatureBase64)
            KeyStoreHelper.verifyData(dataBytes, derBytes, keyAlias)
        } catch (_: Exception) {
            false
        }
    }
}
