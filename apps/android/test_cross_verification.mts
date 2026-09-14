import crypto from 'node:crypto';
import { formatPublicKeyPem, buildCanonicalCollectorEnvelope, verifyDeviceSignature } from '../web/src/lib/api/device-auth.js';
import { parseMfsSms } from '../../packages/sms-parser/src/index.js';
import { Paisa } from '../../packages/payment-core/src/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('   DenaNeya Milestone 5: Android <-> Backend Cross-Verification');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test Suite 1: Hardware Keystore EC P-256 Public Key Export & PEM Conversion
// -----------------------------------------------------------------------------
console.log('Suite 1: Hardware Keystore EC P-256 Public Key Export & PEM Conversion');

// Generate EC P-256 keypair simulating Android Keystore
const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
const publicKeyHex = spkiDer.toString('hex').toLowerCase();

assert(publicKeyHex.length === 182, `Public key hex length must be exactly 182 characters (got ${publicKeyHex.length})`);
assert(publicKeyHex.startsWith('3059301306072a8648ce3d020106082a8648ce3d03010703420004'), 'Public key DER must start with standard ASN.1 EC secp256r1 header');

const pemFormatted = formatPublicKeyPem(publicKeyHex);
assert(pemFormatted.startsWith('-----BEGIN PUBLIC KEY-----'), 'formatPublicKeyPem must prepend standard PEM header');
assert(pemFormatted.endsWith('-----END PUBLIC KEY-----'), 'formatPublicKeyPem must append standard PEM footer');

let parsedPublicKey: crypto.KeyObject | null = null;
try {
  parsedPublicKey = crypto.createPublicKey(pemFormatted);
} catch (e: any) {
  console.error('Error parsing formatted PEM:', e.message);
}
assert(parsedPublicKey !== null, 'Node crypto.createPublicKey must successfully parse formatted public key');
assert(parsedPublicKey?.asymmetricKeyType === 'ec', 'Parsed key must be Elliptic Curve (EC)');

console.log('');

// -----------------------------------------------------------------------------
// Test Suite 2: Strict Canonical JSON Envelope Ordering & Zero Whitespace
// -----------------------------------------------------------------------------
console.log('Suite 2: Strict Canonical JSON Envelope Ordering & Zero Whitespace');

const testDeviceId = 'dev_01a2b3c4d5e6f7a8';
const testSequence = 42;
const testNonce = crypto.randomUUID();
const testTimestamp = 1718000000000;
const testReceivedAt = 1718000000000;

// Replicate Android CanonicalJsonBuilder.buildSmsEnvelope logic in TS
function androidCanonicalJsonBuilder(
  deviceId: string,
  sequenceNumber: number,
  nonce: string,
  timestamp: number,
  sender: string,
  messageText: string,
  receivedAt: number,
  simSlot: number,
  batteryLevel?: number,
  isCharging?: boolean
): string {
  function escapeString(value: string): string {
    return JSON.stringify(value);
  }

  let payloadJson = '{' +
    '"sender":' + escapeString(sender) + ',' +
    '"messageText":' + escapeString(messageText) + ',' +
    '"receivedAt":' + receivedAt + ',' +
    '"simSlot":' + simSlot;
  if (batteryLevel !== undefined) {
    payloadJson += ',"batteryLevel":' + batteryLevel;
  }
  if (isCharging !== undefined) {
    payloadJson += ',"isCharging":' + isCharging;
  }
  payloadJson += '}';

  return '{' +
    '"deviceId":' + escapeString(deviceId) + ',' +
    '"sequenceNumber":' + sequenceNumber + ',' +
    '"nonce":' + escapeString(nonce) + ',' +
    '"timestamp":' + timestamp + ',' +
    '"eventType":"SMS_RECEIVED",' +
    '"payload":' + payloadJson +
    '}';
}

const sampleSms = 'You have received Tk 1,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 25,430.00. TrxID 9K28JA821.';
const androidEnvelope = androidCanonicalJsonBuilder(
  testDeviceId,
  testSequence,
  testNonce,
  testTimestamp,
  'bKash',
  sampleSms,
  testReceivedAt,
  0,
  85,
  false
);

const backendEnvelope = buildCanonicalCollectorEnvelope({
  deviceId: testDeviceId,
  sequenceNumber: testSequence,
  nonce: testNonce,
  timestamp: testTimestamp,
  eventType: 'SMS_RECEIVED',
  payload: {
    sender: 'bKash',
    messageText: sampleSms,
    receivedAt: testReceivedAt,
    simSlot: 0,
    batteryLevel: 85,
    isCharging: false,
  },
});

assert(androidEnvelope === backendEnvelope, 'Android CanonicalJsonBuilder output must match backend buildCanonicalCollectorEnvelope bit-for-bit');
assert(!androidEnvelope.includes(': '), 'Canonical JSON must have zero whitespace after colons');
assert(!androidEnvelope.includes(', '), 'Canonical JSON must have zero whitespace after commas');
assert(androidEnvelope.includes('"sequenceNumber":42,'), 'Numeric sequenceNumber must be unquoted scalar');
assert(androidEnvelope.includes('"timestamp":1718000000000,'), 'Numeric timestamp must be unquoted scalar');

console.log('');

// -----------------------------------------------------------------------------
// Test Suite 3: ECDSA SHA-256 ASN.1 DER Digital Signature Verification
// -----------------------------------------------------------------------------
console.log('Suite 3: ECDSA SHA-256 ASN.1 DER Digital Signature Verification');

// Sign canonical envelope using EC P-256 private key with standard ASN.1 DER output
const signer = crypto.createSign('SHA256');
signer.update(androidEnvelope);
signer.end();
const derSignatureBase64 = signer.sign(keyPair.privateKey, 'base64');

// 1. Legitimate signature must verify cleanly
const isValid = verifyDeviceSignature(androidEnvelope, publicKeyHex, derSignatureBase64);
assert(isValid === true, 'Backend verifyDeviceSignature must return true for valid Android signature');

// 2. Tampering deviceId must fail
const tamperedDeviceIdEnvelope = androidEnvelope.replace(testDeviceId, 'dev_tampered12345');
assert(verifyDeviceSignature(tamperedDeviceIdEnvelope, publicKeyHex, derSignatureBase64) === false, 'Tampered deviceId must fail verification');

// 3. Tampering sequence number must fail
const tamperedSeqEnvelope = androidEnvelope.replace('"sequenceNumber":42', '"sequenceNumber":43');
assert(verifyDeviceSignature(tamperedSeqEnvelope, publicKeyHex, derSignatureBase64) === false, 'Tampered sequenceNumber must fail verification');

// 4. Tampering SMS amount inside payload must fail
const tamperedAmountEnvelope = androidEnvelope.replace('1,500.00', '15,000.00');
assert(verifyDeviceSignature(tamperedAmountEnvelope, publicKeyHex, derSignatureBase64) === false, 'Tampered payment amount must fail verification');

// 5. Wrong public key must fail
const otherKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const otherPublicKeyHex = otherKeyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
assert(verifyDeviceSignature(androidEnvelope, otherPublicKeyHex, derSignatureBase64) === false, 'Unregistered public key must fail verification');

// 6. Corrupted signature must fail
const corruptedSig = derSignatureBase64.substring(0, 10) + (derSignatureBase64[10] === 'X' ? 'Y' : 'X') + derSignatureBase64.substring(11);
assert(verifyDeviceSignature(androidEnvelope, publicKeyHex, corruptedSig) === false, 'Corrupted signature string must fail verification');

console.log('');

// -----------------------------------------------------------------------------
// Test Suite 4: Freshness Window, Monotonic Sequence & Nonce Rules
// -----------------------------------------------------------------------------
console.log('Suite 4: Freshness Window, Monotonic Sequence & Nonce Rules');

const nowMs = Date.now();
const freshTimestamp = nowMs - 60_000; // 1 min ago -> fresh
const staleTimestamp = nowMs - 360_000; // 6 min ago -> stale (> 300s)

function checkFreshness(timestamp: number): boolean {
  return Math.abs(Date.now() - timestamp) <= 300_000;
}

assert(checkFreshness(freshTimestamp) === true, 'Timestamp 1 min old must pass ±300s freshness window');
assert(checkFreshness(staleTimestamp) === false, 'Timestamp 6 min old must fail ±300s freshness window');

function checkMonotonicSequence(newSeq: number, lastRecordedSeq: number): boolean {
  return BigInt(newSeq) > BigInt(lastRecordedSeq);
}

assert(checkMonotonicSequence(43, 42) === true, 'Sequence increment 43 > 42 must be accepted');
assert(checkMonotonicSequence(42, 42) === false, 'Duplicate sequence 42 == 42 must be rejected as replay');
assert(checkMonotonicSequence(41, 42) === false, 'Regressed sequence 41 < 42 must be rejected as replay');

console.log('');

// -----------------------------------------------------------------------------
// Test Suite 5: End-to-End SMS Payload Ingestion & Paisa Integer Math
// -----------------------------------------------------------------------------
console.log('Suite 5: End-to-End SMS Payload Ingestion & Paisa Integer Math');

const testCases = [
  {
    provider: 'bKash',
    text: 'Payment Tk 1,250.00 received from 01712345678. Ref 1002. Counter 1. Fee Tk 0.00. Balance Tk 15,450.00. TrxID 9K38AL90 at 13/09/2026 22:10',
    expectedTrxId: '9K38AL90',
    expectedAmountPaisa: 125000n, // 1250 * 100
  },
  {
    provider: 'NAGAD',
    text: 'Merchant Pay. Amount: Tk 1,500.00. From: 01712345678. Ref: Invoice101. TxnID: 72N4A99X. Fee: Tk 0.00. Balance: Tk 24,500.00. Date: 13/09/2026 21:15',
    expectedTrxId: '72N4A99X',
    expectedAmountPaisa: 150000n, // 1500 * 100
  },
  {
    provider: '16216',
    text: 'Tk1,200.00 received from A/C: 017123456789. Fee Tk0.00. Balance: Tk15,400.00. TxnId: 2847192841. Date:13-SEP-26 21:30:15',
    expectedTrxId: '2847192841',
    expectedAmountPaisa: 120000n, // 1200 * 100
  },
  {
    provider: '16268',
    text: 'Received Tk 1,000.00 from 01712345678. TrxID: UP729401. Fee: Tk 0.00. Balance: Tk 14,200.00. Time: 13/09/2026 20:05',
    expectedTrxId: 'UP729401',
    expectedAmountPaisa: 100000n, // 1000 * 100
  },
];

for (const tc of testCases) {
  const parsed = parseMfsSms(tc.provider, tc.text);
  assert(parsed.status === 'SUCCESS', `${tc.provider} SMS must parse with status SUCCESS`);
  assert(parsed.trxId === tc.expectedTrxId, `${tc.provider} TrxID must match expected '${tc.expectedTrxId}'`);
  assert(parsed.amountPaisa.amountPaisa === tc.expectedAmountPaisa, `${tc.provider} amount must match exact integer Paisa ${tc.expectedAmountPaisa}n (zero floating-point)`);
  assert(typeof parsed.amountPaisa.amountPaisa === 'bigint', `${tc.provider} amount type must be BigInt`);
}

console.log('\n================================================================');
console.log(`   Cross-Verification Summary: ${passed} Passed, ${failed} Failed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
