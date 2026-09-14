import { Paisa } from '@denaneya/payment-core';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliNumerals(val: string | number | bigint): string {
  return String(val).replace(/\d/g, (d) => BENGALI_DIGITS[Number.parseInt(d, 10)] || d);
}

function formatIndianGrouping(numStr: string): string {
  const isNegative = numStr.startsWith('-');
  const cleanStr = isNegative ? numStr.slice(1) : numStr;
  if (cleanStr.length <= 3) return numStr;
  const lastThree = cleanStr.slice(-3);
  const otherNumbers = cleanStr.slice(0, -3);
  const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (isNegative ? '-' : '') + formattedOther + ',' + lastThree;
}

export function formatPaisaToBDT(
  amountPaisa: bigint | number | string | null | undefined,
  options: {
    showSymbol?: boolean;
    banglaDigits?: boolean;
    includePaisa?: boolean;
  } = {}
): string {
  if (amountPaisa === null || amountPaisa === undefined) {
    return options.showSymbol !== false ? '৳ 0.00' : '0.00';
  }

  const p = Paisa.fromPaisa(typeof amountPaisa === 'bigint' ? amountPaisa : BigInt(amountPaisa));
  const bdtString = p.toBDT(); // format like "1250.00"

  const [takaPart = '0', paisaPart = '00'] = bdtString.split('.');
  const formattedTaka = formatIndianGrouping(takaPart); // South Asian grouping (1,00,000)

  let result = options.includePaisa === false && paisaPart === '00'
    ? formattedTaka
    : `${formattedTaka}.${paisaPart}`;

  if (options.banglaDigits) {
    result = toBengaliNumerals(result);
  }

  if (options.showSymbol !== false) {
    return `৳ ${result}`;
  }
  return result;
}

export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
