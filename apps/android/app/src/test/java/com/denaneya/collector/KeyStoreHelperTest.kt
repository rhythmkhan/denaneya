package com.denaneya.collector

import com.denaneya.collector.security.KeyStoreHelper
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.nio.charset.StandardCharsets

class KeyStoreHelperTest {

    private val testAlias = "unit_test_collector_key"

    @Before
    fun setUp() {
        KeyStoreHelper.deleteKey(testAlias)
    }

    @After
    fun tearDown() {
        KeyStoreHelper.deleteKey(testAlias)
    }

    @Test
    fun testKeypairGenerationAndExportHexFormat() {
        // 1. Generate keypair
        val keyPair = KeyStoreHelper.getOrCreateKeyPair(testAlias)
        assertNotNull("Generated keypair must not be null", keyPair)
        assertTrue("hasKey must return true after generation", KeyStoreHelper.hasKey(testAlias))

        // 2. Export public key in hex
        val publicKeyHex = KeyStoreHelper.exportPublicKeyHex(testAlias)
        assertNotNull("Exported public key hex must not be null", publicKeyHex)

        // 3. Invariant: X.509 SubjectPublicKeyInfo for EC P-256 is 91 bytes = 182 hex characters
        assertEquals("Exported public key must be exactly 182 hexadecimal characters", 182, publicKeyHex.length)
        assertTrue("Hex string must contain only valid hex characters", publicKeyHex.matches(Regex("^[0-9a-fA-F]{182}$")))

        // 4. Standard ASN.1 DER SubjectPublicKeyInfo prefix for EC secp256r1:
        // 30 59 (SEQUENCE length 89)
        // 30 13 (SEQUENCE length 19 for AlgorithmIdentifier)
        // 06 07 2a8648ce3d0201 (OID 1.2.840.10045.2.1 = ecPublicKey)
        // 06 08 2a8648ce3d030107 (OID 1.2.840.10045.3.1.7 = secp256r1)
        // 03 42 00 04 (BIT STRING length 66, uncompressed EC point 04...)
        assertTrue(
            "Public key DER hex must start with standard ASN.1 EC secp256r1 header",
            publicKeyHex.lowercase().startsWith("3059301306072a8648ce3d020106082a8648ce3d03010703420004")
        )
    }

    @Test
    fun testDigitalSignatureSigningAndVerification() {
        KeyStoreHelper.getOrCreateKeyPair(testAlias)

        val samplePayload = "{\"deviceId\":\"dev_test_123\",\"sequenceNumber\":1,\"timestamp\":1718000000000}"
        val dataBytes = samplePayload.toByteArray(StandardCharsets.UTF_8)

        // 1. Sign data
        val signatureBytes = KeyStoreHelper.signData(dataBytes, testAlias)
        assertNotNull(signatureBytes)
        assertTrue("Signature bytes length must be > 60 for DER-encoded ECDSA", signatureBytes.size in 68..74)
        // ASN.1 DER SEQUENCE tag is 0x30
        assertEquals("DER signature must begin with SEQUENCE tag 0x30", 0x30.toByte(), signatureBytes[0])

        // 2. Verify legitimate signature
        val isValid = KeyStoreHelper.verifyData(dataBytes, signatureBytes, testAlias)
        assertTrue("Valid signature must pass verification", isValid)

        // 3. Tamper payload -> must fail
        val tamperedPayload = "{\"deviceId\":\"dev_test_123\",\"sequenceNumber\":2,\"timestamp\":1718000000000}"
        val isTamperedValid = KeyStoreHelper.verifyData(
            tamperedPayload.toByteArray(StandardCharsets.UTF_8),
            signatureBytes,
            testAlias
        )
        assertFalse("Tampered payload must fail cryptographic verification", isTamperedValid)

        // 4. Tamper signature byte -> must fail
        val corruptedSig = signatureBytes.copyOf()
        corruptedSig[corruptedSig.size - 1] = (corruptedSig[corruptedSig.size - 1].toInt() xor 0xFF).toByte()
        val isCorruptedValid = KeyStoreHelper.verifyData(dataBytes, corruptedSig, testAlias)
        assertFalse("Corrupted signature must fail verification", isCorruptedValid)
    }

    @Test
    fun testKeyDeletion() {
        KeyStoreHelper.getOrCreateKeyPair(testAlias)
        assertTrue(KeyStoreHelper.hasKey(testAlias))

        KeyStoreHelper.deleteKey(testAlias)
        assertFalse(KeyStoreHelper.hasKey(testAlias))
    }
}
