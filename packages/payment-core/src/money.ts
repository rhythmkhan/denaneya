/**
 * DenaNeya Paisa Currency Arithmetic Engine
 * 1 BDT = 100 Paisa.
 * Backed strictly by 64-bit integer minor units (bigint).
 */

import {
  FloatingPointArithmeticError,
  InvalidMoneyAmountError,
  NegativeAmountError,
} from './errors.js';
import type { Currency, FormattedBDTOptions } from './types.js';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export class Paisa {
  readonly amountPaisa: bigint;
  readonly currency: Currency = 'BDT';

  /**
   * Protected/Internal constructor.
   * Enforces safe integer check if a number is passed.
   */
  constructor(paisa: bigint | number) {
    if (typeof paisa === 'number') {
      if (!Number.isSafeInteger(paisa)) {
        throw new FloatingPointArithmeticError(
          `Cannot construct Paisa from unsafe integer or float number: ${paisa}. Pass a bigint or exact BDT string.`
        );
      }
      this.amountPaisa = BigInt(paisa);
    } else if (typeof paisa === 'bigint') {
      this.amountPaisa = paisa;
    } else {
      throw new InvalidMoneyAmountError(`Invalid type passed to Paisa constructor: ${typeof paisa}`);
    }
  }

  // --- Factory Methods ---

  /**
   * Constructs a Paisa instance from minor units (paisa).
   */
  static fromPaisa(amount: bigint | number): Paisa {
    return new Paisa(amount);
  }

  /**
   * Constructs a Paisa instance from exact BDT string or safe integer.
   * Strictly rejects floating point numbers (e.g. 150.75).
   * Supports: "150.75", "150", "0.05", "150.5", "-50.00", "৳150.75", "150.75 BDT".
   */
  static fromBDT(bdt: string | number): Paisa {
    if (typeof bdt === 'number') {
      if (!Number.isInteger(bdt)) {
        throw new FloatingPointArithmeticError(
          `Floating-point number ${bdt} rejected. Pass BDT as an exact string (e.g. '${bdt.toString()}') to avoid IEEE-754 precision loss.`
        );
      }
      if (!Number.isSafeInteger(bdt)) {
        throw new InvalidMoneyAmountError(`Integer ${bdt} exceeds Number.MAX_SAFE_INTEGER.`);
      }
      return new Paisa(BigInt(bdt) * 100n);
    }

    if (typeof bdt !== 'string') {
      throw new InvalidMoneyAmountError(
        `Expected BDT amount as string or integer number, received ${typeof bdt}.`
      );
    }

    // Sanitize string: trim, remove currency symbols, commas, and BDT suffixes
    let cleaned = bdt.trim();
    cleaned = cleaned.replace(/BDT/gi, '').replace(/[৳,\s]/g, '');

    if (cleaned === '') {
      throw new InvalidMoneyAmountError('Empty string provided for BDT amount.');
    }

    // Match exact decimal pattern: optional sign, whole part, optional 1 or 2 decimal places
    const match = cleaned.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
    if (!match) {
      throw new InvalidMoneyAmountError(`Invalid BDT decimal format: '${bdt}'.`);
    }

    const sign = match[1] === '-' ? -1n : 1n;
    const wholeStr = match[2] ?? '0';
    const fracStr = match[3] ?? '';

    // Reject fractional sub-paisa (more than 2 decimal digits)
    if (fracStr.length > 2) {
      throw new InvalidMoneyAmountError(
        `Sub-paisa fractional precision rejected: '${bdt}' has ${fracStr.length} decimal places (maximum 2 allowed).`
      );
    }

    const wholePaisa = BigInt(wholeStr) * 100n;
    const fracPaisa = fracStr.length === 0 ? 0n : BigInt(fracStr.padEnd(2, '0'));

    const totalPaisa = sign * (wholePaisa + fracPaisa);
    return new Paisa(totalPaisa);
  }

  /**
   * Returns a 0 BDT Paisa instance.
   */
  static zero(): Paisa {
    return new Paisa(0n);
  }

  /**
   * Returns the minimum of multiple Paisa instances.
   */
  static min(...items: Paisa[]): Paisa {
    if (items.length === 0) {
      throw new InvalidMoneyAmountError('Paisa.min requires at least one argument.');
    }
    let minItem = items[0]!;
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.amountPaisa < minItem.amountPaisa) {
        minItem = items[i]!;
      }
    }
    return minItem;
  }

  /**
   * Returns the maximum of multiple Paisa instances.
   */
  static max(...items: Paisa[]): Paisa {
    if (items.length === 0) {
      throw new InvalidMoneyAmountError('Paisa.max requires at least one argument.');
    }
    let maxItem = items[0]!;
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.amountPaisa > maxItem.amountPaisa) {
        maxItem = items[i]!;
      }
    }
    return maxItem;
  }

  /**
   * Sums an array of Paisa instances.
   */
  static sum(...items: Paisa[]): Paisa {
    let total = 0n;
    for (const item of items) {
      total += item.amountPaisa;
    }
    return new Paisa(total);
  }

  // --- Arithmetic Operations ---

  /**
   * Adds another Paisa instance.
   */
  add(other: Paisa): Paisa {
    return new Paisa(this.amountPaisa + other.amountPaisa);
  }

  /**
   * Subtracts another Paisa instance.
   * By default, rejects negative results unless allowNegative = true.
   */
  subtract(other: Paisa, allowNegative = false): Paisa {
    const diff = this.amountPaisa - other.amountPaisa;
    if (!allowNegative && diff < 0n) {
      throw new NegativeAmountError(
        `Subtraction underflow: ${this.toBDT()} BDT - ${other.toBDT()} BDT would result in negative balance.`,
        { currentPaisa: this.amountPaisa.toString(), minusPaisa: other.amountPaisa.toString() }
      );
    }
    return new Paisa(diff);
  }

  /**
   * Multiplies Paisa by an integer or scaled factor using pure integer math.
   * If factor is a float or decimal number, it is parsed via exact string ratio
   * with standard half-up integer rounding: (paisa * num + scale / 2) / scale.
   */
  multiply(factor: number | bigint): Paisa {
    if (typeof factor === 'bigint') {
      return new Paisa(this.amountPaisa * factor);
    }

    if (typeof factor !== 'number' || !Number.isFinite(factor)) {
      throw new InvalidMoneyAmountError(`Invalid multiplier factor: ${factor}`);
    }

    if (Number.isInteger(factor)) {
      return new Paisa(this.amountPaisa * BigInt(factor));
    }

    // Exact decimal scaling for floating factors without float math
    const factorStr = factor.toString();
    const parts = factorStr.split('.');
    const integerPart = parts[0] ?? '0';
    const fracPart = parts[1] ?? '';
    const decimals = fracPart.length;

    const scale = 10n ** BigInt(decimals);
    const numerator = BigInt(integerPart + fracPart);

    const isNegative = (this.amountPaisa < 0n) !== (factor < 0);
    const absPaisa = this.amountPaisa < 0n ? -this.amountPaisa : this.amountPaisa;
    const absNumerator = numerator < 0n ? -numerator : numerator;

    // Half-up rounding
    const product = (absPaisa * absNumerator + scale / 2n) / scale;
    return new Paisa(isNegative ? -product : product);
  }

  /**
   * Splits an amount into N parts with deterministic remainder distribution.
   * Guarantees: sum(parts) === this.amountPaisa down to 1 single paisa!
   * Zero paisa is lost to rounding.
   */
  split(parts: number): Paisa[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new InvalidMoneyAmountError(`Split parts must be a positive integer, received: ${parts}`);
    }

    const n = BigInt(parts);
    const isNegative = this.amountPaisa < 0n;
    const absPaisa = isNegative ? -this.amountPaisa : this.amountPaisa;

    const baseAmount = absPaisa / n;
    const remainder = Number(absPaisa % n);

    const result: Paisa[] = [];
    for (let i = 0; i < parts; i++) {
      const share = baseAmount + (i < remainder ? 1n : 0n);
      result.push(new Paisa(isNegative ? -share : share));
    }
    return result;
  }

  /**
   * Calculates a percentage using Basis Points (100 bps = 1%, 10,000 bps = 100%).
   * Uses half-up integer rounding: (amountPaisa * bps + 5000) / 10000.
   */
  percentage(basisPoints: number | bigint): Paisa {
    const bps = typeof basisPoints === 'bigint' ? basisPoints : BigInt(Math.round(basisPoints));
    const isNegative = (this.amountPaisa < 0n) !== (bps < 0n);
    const absPaisa = this.amountPaisa < 0n ? -this.amountPaisa : this.amountPaisa;
    const absBps = bps < 0n ? -bps : bps;

    // Half-up integer rounding
    const calculated = (absPaisa * absBps + 5000n) / 10000n;
    return new Paisa(isNegative ? -calculated : calculated);
  }

  // --- Comparison & Predicates ---

  equals(other: Paisa): boolean {
    return this.amountPaisa === other.amountPaisa;
  }

  greaterThan(other: Paisa): boolean {
    return this.amountPaisa > other.amountPaisa;
  }
  gt(other: Paisa): boolean {
    return this.greaterThan(other);
  }

  greaterThanOrEqual(other: Paisa): boolean {
    return this.amountPaisa >= other.amountPaisa;
  }
  gte(other: Paisa): boolean {
    return this.greaterThanOrEqual(other);
  }

  lessThan(other: Paisa): boolean {
    return this.amountPaisa < other.amountPaisa;
  }
  lt(other: Paisa): boolean {
    return this.lessThan(other);
  }

  lessThanOrEqual(other: Paisa): boolean {
    return this.amountPaisa <= other.amountPaisa;
  }
  lte(other: Paisa): boolean {
    return this.lessThanOrEqual(other);
  }

  isZero(): boolean {
    return this.amountPaisa === 0n;
  }

  isPositive(): boolean {
    return this.amountPaisa > 0n;
  }

  isNegative(): boolean {
    return this.amountPaisa < 0n;
  }

  abs(): Paisa {
    return this.amountPaisa < 0n ? new Paisa(-this.amountPaisa) : this;
  }

  negate(): Paisa {
    return new Paisa(-this.amountPaisa);
  }

  // --- Conversions & String Formatting ---

  toPaisa(): bigint {
    return this.amountPaisa;
  }

  /**
   * Safe conversion to standard number. Throws if outside safe integer range.
   */
  toNumber(): number {
    const num = Number(this.amountPaisa);
    if (!Number.isSafeInteger(num)) {
      throw new InvalidMoneyAmountError(
        `Paisa amount ${this.amountPaisa.toString()} exceeds JavaScript Number.MAX_SAFE_INTEGER.`
      );
    }
    return num;
  }

  /**
   * Formats into standard decimal BDT string without float math:
   * e.g. "150.75", "0.05", "-50.00".
   */
  toBDT(): string {
    const sign = this.amountPaisa < 0n ? '-' : '';
    const absPaisa = this.amountPaisa < 0n ? -this.amountPaisa : this.amountPaisa;
    const whole = absPaisa / 100n;
    const frac = absPaisa % 100n;
    return `${sign}${whole.toString()}.${frac.toString().padStart(2, '0')}`;
  }

  /**
   * Formats into human-readable BDT representation.
   * Supports South Asian comma separation (Lakh/Crore: 1,50,000.00), Bengali numerals, and currency symbols.
   */
  toFormattedBDT(options: FormattedBDTOptions = {}): string {
    const {
      includeSymbol = false,
      currencyCode = false,
      locale = 'en',
      useGrouping = true,
    } = options;

    const sign = this.amountPaisa < 0n ? '-' : '';
    const absPaisa = this.amountPaisa < 0n ? -this.amountPaisa : this.amountPaisa;
    const wholeStr = (absPaisa / 100n).toString();
    const fracStr = (absPaisa % 100n).toString().padStart(2, '0');

    let formattedWhole = wholeStr;

    if (useGrouping && wholeStr.length > 3) {
      // South Asian grouping: last 3 digits, then groups of 2 digits
      const last3 = wholeStr.slice(-3);
      const remaining = wholeStr.slice(0, -3);
      const parts: string[] = [];
      for (let i = remaining.length; i > 0; i -= 2) {
        parts.unshift(remaining.slice(Math.max(0, i - 2), i));
      }
      formattedWhole = `${parts.join(',')},${last3}`;
    }

    let result = `${sign}${formattedWhole}.${fracStr}`;

    if (locale === 'bn') {
      result = result
        .split('')
        .map((char) => {
          const digit = parseInt(char, 10);
          return Number.isInteger(digit) ? BENGALI_DIGITS[digit] : char;
        })
        .join('');
    }

    if (includeSymbol) {
      result = `৳${result}`;
    }
    if (currencyCode) {
      result = `${result} BDT`;
    }

    return result;
  }

  toString(): string {
    return `${this.toBDT()} BDT`;
  }

  toJSON(): string {
    return this.toBDT();
  }
}
