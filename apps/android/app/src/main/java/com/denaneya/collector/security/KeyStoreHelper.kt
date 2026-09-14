package com.denaneya.collector.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Log
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Manages hardware-backed Elliptic Curve (P-256) cryptographic keys in AndroidKeyStore.
 * Enforces StrongBox hardware isolation where available with automatic fallback to TEE.
 * Supports standard Java Security fallback for local JVM unit test environments.
 */
object KeyStoreHelper {

    private const val TAG = "KeyStoreHelper"
    private const val ANDROID_KEYSTORE_PROVIDER = "AndroidKeyStore"
    const val DEFAULT_KEY_ALIAS = "denaneya_collector_key"
    private const val EC_CURVE_NAME = "secp256r1"
    private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"

    // In-memory fallback for local non-Android JVM testing
    private val testFallbackKeyPairs = mutableMapOf<String, KeyPair>()

    private val isAndroidKeyStoreAvailable: Boolean by lazy {
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE_PROVIDER).apply { load(null) }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getKeyStore(): KeyStore? {
        return try {
            if (isAndroidKeyStoreAvailable) {
                KeyStore.getInstance(ANDROID_KEYSTORE_PROVIDER).apply { load(null) }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "AndroidKeyStore unavailable: ${e.message}")
            null
        }
    }

    /**
     * Checks whether a key with the given alias exists in the Android Keystore.
     */
    @Synchronized
    fun hasKey(alias: String = DEFAULT_KEY_ALIAS): Boolean {
        val ks = getKeyStore()
        return if (ks != null) {
            try {
                ks.containsAlias(alias)
            } catch (e: Exception) {
                Log.e(TAG, "Error inspecting Keystore alias: $alias", e)
                false
            }
        } else {
            testFallbackKeyPairs.containsKey(alias)
        }
    }

    /**
     * Deletes the specified keypair from Android Keystore.
     */
    @Synchronized
    fun deleteKey(alias: String = DEFAULT_KEY_ALIAS) {
        val ks = getKeyStore()
        if (ks != null) {
            try {
                if (ks.containsAlias(alias)) {
                    ks.deleteEntry(alias)
                    Log.i(TAG, "Successfully purged Keystore entry for alias: $alias")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to delete Keystore entry for alias: $alias", e)
            }
        } else {
            testFallbackKeyPairs.remove(alias)
        }
    }

    /**
     * Retrieves or creates a hardware-backed EC P-256 keypair.
     * Attempts StrongBox HSM backing first, falling back gracefully to standard TEE.
     */
    @Synchronized
    fun getOrCreateKeyPair(alias: String = DEFAULT_KEY_ALIAS): KeyPair {
        val existing = getKeyPair(alias)
        if (existing != null) {
            return existing
        }
        return generateKeyPairInternal(alias)
    }

    /**
     * Retrieves the existing keypair for the given alias.
     */
    @Synchronized
    fun getKeyPair(alias: String = DEFAULT_KEY_ALIAS): KeyPair? {
        val ks = getKeyStore()
        if (ks != null) {
            return try {
                if (!ks.containsAlias(alias)) return null

                val privateKey = ks.getKey(alias, null) as? PrivateKey ?: return null
                val certificate = ks.getCertificate(alias) ?: return null
                val publicKey = certificate.publicKey ?: return null

                KeyPair(publicKey, privateKey)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load keypair from Keystore for alias: $alias", e)
                null
            }
        } else {
            return testFallbackKeyPairs[alias]
        }
    }

    /**
     * Exports the EC P-256 public key in X.509 SubjectPublicKeyInfo format
     * as a lowercase hexadecimal string (exactly 182 characters).
     *
     * This format is directly compatible with `formatPublicKeyPem` in `device-auth.ts`.
     */
    @Synchronized
    fun exportPublicKeyHex(alias: String = DEFAULT_KEY_ALIAS): String {
        val keyPair = getKeyPair(alias)
            ?: throw IllegalStateException("Cannot export public key: alias '$alias' does not exist.")
        val derBytes = keyPair.public.encoded
            ?: throw IllegalStateException("Public key encoding failed: getEncoded() returned null.")

        return derBytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Digitally signs the given data using the private key associated with the alias.
     * Produces standard ASN.1 DER signature bytes.
     */
    @Synchronized
    fun signData(data: ByteArray, alias: String = DEFAULT_KEY_ALIAS): ByteArray {
        val keyPair = getKeyPair(alias)
            ?: throw IllegalStateException("Cannot sign: alias '$alias' does not exist.")
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
        signature.initSign(keyPair.private)
        signature.update(data)
        return signature.sign()
    }

    /**
     * Verifies the given digital signature against data and public key for alias.
     */
    @Synchronized
    fun verifyData(data: ByteArray, signatureBytes: ByteArray, alias: String = DEFAULT_KEY_ALIAS): Boolean {
        val keyPair = getKeyPair(alias) ?: return false
        return try {
            val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
            signature.initVerify(keyPair.public)
            signature.update(data)
            signature.verify(signatureBytes)
        } catch (e: Exception) {
            Log.e(TAG, "Signature verification exception: ${e.message}", e)
            false
        }
    }

    /**
     * Internal generation logic with StrongBox -> TEE fallback (or Standard JVM fallback).
     */
    private fun generateKeyPairInternal(alias: String): KeyPair {
        deleteKey(alias)

        val ks = getKeyStore()
        if (ks == null) {
            // JVM Standard EC Generator
            val kpg = KeyPairGenerator.getInstance("EC")
            kpg.initialize(ECGenParameterSpec(EC_CURVE_NAME))
            val kp = kpg.generateKeyPair()
            testFallbackKeyPairs[alias] = kp
            return kp
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                Log.d(TAG, "Attempting key generation with StrongBox backing...")
                return generateEcKey(alias, useStrongBox = true)
            } catch (e: Exception) {
                if (e is StrongBoxUnavailableException ||
                    e.javaClass.name.contains("StrongBoxUnavailableException") ||
                    e.cause is StrongBoxUnavailableException
                ) {
                    Log.w(TAG, "StrongBox hardware unavailable on this device. Falling back to standard TEE.")
                } else {
                    Log.w(TAG, "StrongBox generation failed (${e.message}). Falling back to TEE.", e)
                }
            }
        }

        Log.d(TAG, "Generating key in standard hardware TEE...")
        return generateEcKey(alias, useStrongBox = false)
    }

    private fun generateEcKey(alias: String, useStrongBox: Boolean): KeyPair {
        val kpg = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE_PROVIDER
        )

        val specBuilder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec(EC_CURVE_NAME))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && useStrongBox) {
            specBuilder.setIsStrongBoxBacked(true)
        }

        kpg.initialize(specBuilder.build())
        val keyPair = kpg.generateKeyPair()
        Log.i(TAG, "Successfully created EC P-256 keypair for alias '$alias' (StrongBox: $useStrongBox)")
        return keyPair
    }
}
