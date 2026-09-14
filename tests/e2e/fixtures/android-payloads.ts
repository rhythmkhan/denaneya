import crypto from 'node:crypto';
import { EC_P256_TEST_KEY } from './crypto-keys.js';
import { TEST_CONSTANTS } from '../config/test-constants.js';

export interface AndroidCollectorEventEnvelope {
  deviceId: string;
  sequenceNumber: number;
  nonce: string;
  timestamp: number;
  eventType: 'SMS_RECEIVED' | 'HEARTBEAT' | 'STATUS_UPDATE';
  payload: {
    sender: string;
    rawMessage: string;
    simSlot?: number;
    subscriptionId?: number;
  };
  signature: string; // Base64
}

export function buildCanonicalEnvelope(data: {
  deviceId: string;
  sequenceNumber: number;
  nonce: string;
  timestamp: number;
  eventType: string;
  payload: any;
}): string {
  return JSON.stringify({
    deviceId: data.deviceId,
    sequenceNumber: data.sequenceNumber,
    nonce: data.nonce,
    timestamp: data.timestamp,
    eventType: data.eventType,
    payload: data.payload,
  });
}

export function signCollectorEnvelope(
  canonicalJson: string,
  privateKeyPem: string = EC_P256_TEST_KEY.privateKeyPem
): string {
  const signer = crypto.createSign('SHA256');
  signer.update(canonicalJson);
  return signer.sign(privateKeyPem, 'base64');
}

export function createValidCollectorPayload(
  overrides?: Partial<AndroidCollectorEventEnvelope>,
  privateKeyPem: string = EC_P256_TEST_KEY.privateKeyPem
): AndroidCollectorEventEnvelope {
  const deviceId = overrides?.deviceId ?? TEST_CONSTANTS.DEVICES.COLLECTOR_01_ID;
  const sequenceNumber = overrides?.sequenceNumber ?? 1;
  const nonce = overrides?.nonce ?? crypto.randomUUID();
  const timestamp = overrides?.timestamp ?? Date.now();
  const eventType = overrides?.eventType ?? 'SMS_RECEIVED';
  const payload = overrides?.payload ?? {
    sender: 'bKash',
    rawMessage:
      'You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90 at 13/09/2026 22:10',
    simSlot: 0,
  };

  const canonical = buildCanonicalEnvelope({
    deviceId,
    sequenceNumber,
    nonce,
    timestamp,
    eventType,
    payload,
  });

  const signature = overrides?.signature ?? signCollectorEnvelope(canonical, privateKeyPem);

  return {
    deviceId,
    sequenceNumber,
    nonce,
    timestamp,
    eventType,
    payload,
    signature,
  };
}
