import QRCode from 'qrcode';

/**
 * Calculates EMVCo standard CRC-16 (polynomial 0x1021, initial value 0xFFFF)
 */
export function calculateCrc16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    const b = payload.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((b >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }

  crc &= 0xffff;
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export interface BanglaQrPayloadInput {
  merchantId: string;
  merchantName: string;
  merchantCity?: string;
  merchantCategoryCode?: string;
  amountBDT?: string;
  billNumber?: string;
  isDynamic?: boolean;
}

/**
 * Generates an EMVCo compliant Bangla QR string adhering to Bangladesh Bank specifications.
 */
export function generateBanglaQrPayload(input: BanglaQrPayloadInput): string {
  const tag00 = formatTlv('00', '01'); // Payload format indicator
  const tag01 = formatTlv('01', input.isDynamic ? '12' : '11'); // 11=Static, 12=Dynamic

  // Tag 26: Merchant Account Information
  const subTag00 = formatTlv('00', 'bd.gov.banglabank');
  const subTag01 = formatTlv('01', input.merchantId);
  const tag26 = formatTlv('26', `${subTag00}${subTag01}`);

  const tag52 = formatTlv('52', input.merchantCategoryCode || '5411'); // Grocery/Retail default
  const tag53 = formatTlv('53', '050'); // Currency 050 = BDT

  let tag54 = '';
  if (input.amountBDT) {
    tag54 = formatTlv('54', Number(input.amountBDT).toFixed(2));
  }

  const tag58 = formatTlv('58', 'BD'); // Country code
  const tag59 = formatTlv('59', (input.merchantName || 'MERCHANT').slice(0, 25));
  const tag60 = formatTlv('60', (input.merchantCity || 'Dhaka').slice(0, 15));

  let tag62 = '';
  if (input.billNumber) {
    const subTag01Ref = formatTlv('01', input.billNumber.slice(0, 25));
    tag62 = formatTlv('62', subTag01Ref);
  }

  const rawPayload = `${tag00}${tag01}${tag26}${tag52}${tag53}${tag54}${tag58}${tag59}${tag60}${tag62}6304`;
  const checksum = calculateCrc16(rawPayload);

  return `${rawPayload}${checksum}`;
}

/**
 * Generates Data URL image for a given text or QR payload.
 */
export async function generateQrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: {
      dark: '#059669', // Emerald
      light: '#ffffff',
    },
  });
}
