const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/**
 * Parses dates found in Bangladeshi MFS SMS messages.
 * Formats supported:
 * 1. DD/MM/YYYY HH:mm (e.g. 13/09/2026 22:10)
 * 2. DD/MM/YYYY HH:mm:ss (e.g. 13/09/2026 22:10:05)
 * 3. DD-MM-YYYY HH:mm (e.g. 13-09-2026 22:10)
 * 4. DD-MMM-YY HH:mm:ss (e.g. 13-SEP-26 21:30:15)
 * 5. DD-MMM-YYYY HH:mm:ss (e.g. 13-SEP-2026 21:30:15)
 *
 * Always produces a Date corresponding to Bangladesh Standard Time (UTC+6).
 */
export function parseBstDate(dateStr: string): Date {
  const cleaned = dateStr.trim();

  // Pattern 1: DD/MM/YYYY or DD-MM-YYYY [HH:mm or HH:mm:ss]
  const numericMatch = cleaned.match(
    /^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (numericMatch) {
    const day = parseInt(numericMatch[1]!, 10);
    const month = parseInt(numericMatch[2]!, 10) - 1;
    const year = parseInt(numericMatch[3]!, 10);
    const hour = numericMatch[4] ? parseInt(numericMatch[4], 10) : 0;
    const minute = numericMatch[5] ? parseInt(numericMatch[5], 10) : 0;
    const second = numericMatch[6] ? parseInt(numericMatch[6], 10) : 0;

    // Construct UTC timestamp and subtract 6 hours for BST (+06:00)
    const utcMillis = Date.UTC(year, month, day, hour - 6, minute, second);
    return new Date(utcMillis);
  }

  // Pattern 2: DD-MMM-YY or DD-MMM-YYYY [HH:mm:ss or HH:mm] (Rocket format)
  const alphaMatch = cleaned.match(
    /^(\d{2})-([A-Za-z]{3})-(\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (alphaMatch) {
    const day = parseInt(alphaMatch[1]!, 10);
    const monthStr = alphaMatch[2]!.toUpperCase();
    const month = MONTH_MAP[monthStr] ?? 0;
    let year = parseInt(alphaMatch[3]!, 10);
    if (year < 100) {
      year += 2000;
    }
    const hour = alphaMatch[4] ? parseInt(alphaMatch[4], 10) : 0;
    const minute = alphaMatch[5] ? parseInt(alphaMatch[5], 10) : 0;
    const second = alphaMatch[6] ? parseInt(alphaMatch[6], 10) : 0;

    const utcMillis = Date.UTC(year, month, day, hour - 6, minute, second);
    return new Date(utcMillis);
  }

  // Fallback to Date.parse or current time if unparseable
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}