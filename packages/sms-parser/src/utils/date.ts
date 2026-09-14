import { normalizeBengaliNumerals } from './bengali.js';

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  JANUARY: 0,
  FEB: 1,
  FEBRUARY: 1,
  MAR: 2,
  MARCH: 2,
  APR: 3,
  APRIL: 3,
  MAY: 4,
  JUN: 5,
  JUNE: 5,
  JUL: 6,
  JULY: 6,
  AUG: 7,
  AUGUST: 7,
  SEP: 8,
  SEPT: 8,
  SEPTEMBER: 8,
  OCT: 9,
  OCTOBER: 9,
  NOV: 10,
  NOVEMBER: 10,
  DEC: 11,
  DECEMBER: 11,

  // Bengali transliterated months
  জানু: 0,
  জানুয়ারি: 0,
  ফেব্রু: 1,
  ফেব্রুয়ারি: 1,
  মার্চ: 2,
  এপ্রিল: 3,
  মে: 4,
  জুন: 5,
  জুলাই: 6,
  আগস্ট: 7,
  সেপ্টে: 8,
  সেপ্টেম্বর: 8,
  অক্টো: 9,
  অক্টোবর: 9,
  নভে: 10,
  নভেম্বর: 10,
  ডিসে: 11,
  ডিসেম্বর: 11,
};

function adjustHour(hour: number, meridiem?: string): number {
  if (!meridiem) return hour;
  const m = meridiem.toLowerCase().trim();
  if (m === 'pm' || m === 'অপরাহ্ন' || m === 'বিকাল' || m === 'সন্ধ্যা' || m === 'দুপুর') {
    return hour < 12 ? hour + 12 : hour;
  }
  if (m === 'am' || m === 'পূর্বাহ্ন' || m === 'সকাল') {
    return hour === 12 ? 0 : hour;
  }
  return hour;
}

/**
 * Parses dates found in Bangladeshi MFS SMS messages.
 * Formats supported:
 * 1. DD/MM/YYYY or DD-MM-YYYY [HH:mm or HH:mm:ss] [AM/PM]
 * 2. DD-MMM-YY or DD-MMM-YYYY [HH:mm:ss or HH:mm] [AM/PM] (Rocket format, English & Bengali months)
 * 3. YYYY-MM-DD or YYYY/MM/DD [HH:mm:ss or HH:mm] [AM/PM]
 *
 * Always produces a Date corresponding to Bangladesh Standard Time (UTC+6),
 * correctly rolling over month/year boundaries without precision loss.
 */
export function parseBstDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // Strip trailing punctuation and convert any Bengali digits
  let cleaned = normalizeBengaliNumerals(dateStr.trim());
  cleaned = cleaned.replace(/[।.,;:!?\s]+$/, '').trim();

  // Pattern 1: DD/MM/YYYY or DD-MM-YYYY [HH:mm or HH:mm:ss] [AM/PM]
  const numericMatch = cleaned.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(?:(সকাল|দুপুর|বিকাল|সন্ধ্যা|রাত|পূর্বাহ্ন|অপরাহ্ন)\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]|পূর্বাহ্ন|অপরাহ্ন))?)?$/
  );
  if (numericMatch) {
    const day = parseInt(numericMatch[1]!, 10);
    const month = parseInt(numericMatch[2]!, 10) - 1;
    let year = parseInt(numericMatch[3]!, 10);
    if (year < 100) {
      year += 2000;
    }
    const meridiem = numericMatch[8] || numericMatch[4];
    const hourRaw = numericMatch[5] ? parseInt(numericMatch[5], 10) : 0;
    const hour = adjustHour(hourRaw, meridiem);
    const minute = numericMatch[6] ? parseInt(numericMatch[6], 10) : 0;
    const second = numericMatch[7] ? parseInt(numericMatch[7], 10) : 0;

    const utcMillis = Date.UTC(year, month, day, hour - 6, minute, second);
    return new Date(utcMillis);
  }

  // Pattern 2: DD-MMM-YY or DD-MMM-YYYY [HH:mm:ss or HH:mm] (Rocket format, English or Bengali month)
  const alphaMatch = cleaned.match(
    /^(\d{1,2})[-/]([A-Za-z\u0980-\u09FF]{2,12})[-/](\d{2,4})(?:\s+(?:(সকাল|দুপুর|বিকাল|সন্ধ্যা|রাত|পূর্বাহ্ন|অপরাহ্ন)\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]|পূর্বাহ্ন|অপরাহ্ন))?)?$/
  );
  if (alphaMatch) {
    const day = parseInt(alphaMatch[1]!, 10);
    const rawMonth = alphaMatch[2]!.trim();
    const monthKey = rawMonth.toUpperCase();
    const month = MONTH_MAP[monthKey] ?? MONTH_MAP[rawMonth] ?? 0;
    let year = parseInt(alphaMatch[3]!, 10);
    if (year < 100) {
      year += 2000;
    }
    const meridiem = alphaMatch[8] || alphaMatch[4];
    const hourRaw = alphaMatch[5] ? parseInt(alphaMatch[5], 10) : 0;
    const hour = adjustHour(hourRaw, meridiem);
    const minute = alphaMatch[6] ? parseInt(alphaMatch[6], 10) : 0;
    const second = alphaMatch[7] ? parseInt(alphaMatch[7], 10) : 0;

    const utcMillis = Date.UTC(year, month, day, hour - 6, minute, second);
    return new Date(utcMillis);
  }

  // Pattern 3: YYYY-MM-DD or YYYY/MM/DD [HH:mm or HH:mm:ss] (ISO-like)
  const isoMatch = cleaned.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(?:(সকাল|দুপুর|বিকাল|সন্ধ্যা|রাত|পূর্বাহ্ন|অপরাহ্ন)\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]|পূর্বাহ্ন|অপরাহ্ন))?)?$/
  );
  if (isoMatch) {
    const year = parseInt(isoMatch[1]!, 10);
    const month = parseInt(isoMatch[2]!, 10) - 1;
    const day = parseInt(isoMatch[3]!, 10);
    const meridiem = isoMatch[8] || isoMatch[4];
    const hourRaw = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const hour = adjustHour(hourRaw, meridiem);
    const minute = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const second = isoMatch[7] ? parseInt(isoMatch[7], 10) : 0;

    const utcMillis = Date.UTC(year, month, day, hour - 6, minute, second);
    return new Date(utcMillis);
  }

  // Fallback to Date.parse or current time if unparseable
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}