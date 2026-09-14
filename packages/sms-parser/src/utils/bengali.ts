const BENGALI_TO_LATIN_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Translates Bengali numerals (০-৯) into ASCII Latin digits (0-9).
 */
export function normalizeBengaliNumerals(input: string): string {
  return input.replace(/[০-৯]/g, (digit) => BENGALI_TO_LATIN_DIGITS[digit] ?? digit);
}

/**
 * Cleans and standardizes raw SMS text:
 * - Normalizes Bengali digits to Latin digits
 * - Replaces Bengali Danda (।) with a dot (.)
 * - Normalizes various unicode whitespaces (NBSP, zero-width spaces)
 * - Collapses multiple spaces into a single space
 */
export function sanitizeSmsText(raw: string): string {
  if (!raw) return '';

  let text = raw;
  // Replace zero-width spaces and non-breaking spaces
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = text.replace(/[\u00A0\u202F]/g, ' ');

  // Replace Bengali danda (।) with period (.)
  text = text.replace(/[\u0964\u0965]/g, '. ');

  // Convert Bengali digits to ASCII
  text = normalizeBengaliNumerals(text);

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ').trim();

  return text;
}