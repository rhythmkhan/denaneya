import { describe, it, expect } from 'vitest';
import { Paisa } from '../src/money.js';
import {
  FloatingPointArithmeticError,
  InvalidMoneyAmountError,
  NegativeAmountError,
} from '../src/errors.js';

describe('Paisa - Monetary Arithmetic Engine', () => {
  describe('Constructor & Factory Methods', () => {
    it('constructs from bigint paisa', () => {
      const p = new Paisa(15000n);
      expect(p.amountPaisa).toBe(15000n);
      expect(p.toPaisa()).toBe(15000n);
    });

    it('constructs from safe integer number', () => {
      const p = Paisa.fromPaisa(15000);
      expect(p.amountPaisa).toBe(15000n);
    });

    it('throws FloatingPointArithmeticError when constructed with float number', () => {
      expect(() => new Paisa(150.75)).toThrow(FloatingPointArithmeticError);
      expect(() => Paisa.fromPaisa(10.5)).toThrow(FloatingPointArithmeticError);
    });

    it('Paisa.fromBDT creates correct instance from exact string', () => {
      expect(Paisa.fromBDT('150.75').amountPaisa).toBe(15075n);
      expect(Paisa.fromBDT('150').amountPaisa).toBe(15000n);
      expect(Paisa.fromBDT('0.05').amountPaisa).toBe(5n);
      expect(Paisa.fromBDT('150.5').amountPaisa).toBe(15050n);
      expect(Paisa.fromBDT('-50.00').amountPaisa).toBe(-5000n);
      expect(Paisa.fromBDT('৳1,500.00').amountPaisa).toBe(150000n);
      expect(Paisa.fromBDT('1500.50 BDT').amountPaisa).toBe(150050n);
      expect(Paisa.fromBDT(' +10.25 ').amountPaisa).toBe(1025n);
    });

    it('Paisa.fromBDT creates correct instance from integer number', () => {
      expect(Paisa.fromBDT(150).amountPaisa).toBe(15000n);
      expect(Paisa.fromBDT(0).amountPaisa).toBe(0n);
    });

    it('Paisa.fromBDT rejects floating point number input', () => {
      expect(() => Paisa.fromBDT(150.75)).toThrow(FloatingPointArithmeticError);
    });

    it('Paisa.fromBDT rejects invalid strings', () => {
      expect(() => Paisa.fromBDT('')).toThrow(InvalidMoneyAmountError);
      expect(() => Paisa.fromBDT('abc')).toThrow(InvalidMoneyAmountError);
      expect(() => Paisa.fromBDT('12.34.56')).toThrow(InvalidMoneyAmountError);
      expect(() => Paisa.fromBDT('150.755')).toThrow(InvalidMoneyAmountError); // sub-paisa rejected
    });

    it('zero, min, max, sum work correctly', () => {
      expect(Paisa.zero().amountPaisa).toBe(0n);

      const p1 = Paisa.fromBDT('10.00');
      const p2 = Paisa.fromBDT('20.00');
      const p3 = Paisa.fromBDT('15.00');

      expect(Paisa.min(p1, p2, p3).amountPaisa).toBe(1000n);
      expect(Paisa.max(p1, p2, p3).amountPaisa).toBe(2000n);
      expect(Paisa.sum(p1, p2, p3).amountPaisa).toBe(4500n);

      expect(() => Paisa.min()).toThrow(InvalidMoneyAmountError);
      expect(() => Paisa.max()).toThrow(InvalidMoneyAmountError);
    });
  });

  describe('Arithmetic Operations', () => {
    it('adds two Paisa amounts accurately', () => {
      const a = Paisa.fromBDT('100.50');
      const b = Paisa.fromBDT('200.75');
      const sum = a.add(b);
      expect(sum.amountPaisa).toBe(30125n);
      expect(sum.toBDT()).toBe('301.25');
    });

    it('subtracts two Paisa amounts and prevents negative unless allowed', () => {
      const a = Paisa.fromBDT('200.00');
      const b = Paisa.fromBDT('50.00');
      expect(a.subtract(b).toBDT()).toBe('150.00');

      expect(() => b.subtract(a)).toThrow(NegativeAmountError);
      expect(b.subtract(a, true).toBDT()).toBe('-150.00');
    });

    it('multiplies by integer and float factor with half-up rounding', () => {
      const p = Paisa.fromBDT('100.00'); // 10000 paisa
      expect(p.multiply(2).toBDT()).toBe('200.00');
      expect(p.multiply(3n).toBDT()).toBe('300.00');

      // Decimal multiplier: 100.00 * 1.05 = 105.00
      expect(p.multiply(1.05).toBDT()).toBe('105.00');

      // 150.75 paisa with rounding
      const p2 = Paisa.fromPaisa(15075);
      expect(p2.multiply(0.1).toPaisa()).toBe(1508n); // 1507.5 -> 1508n
    });

    it('splits amount into N parts with zero lost penny invariant', () => {
      const total = Paisa.fromBDT('1.00'); // 100 paisa
      const parts = total.split(3);

      expect(parts).toHaveLength(3);
      expect(parts[0]?.toPaisa()).toBe(34n);
      expect(parts[1]?.toPaisa()).toBe(33n);
      expect(parts[2]?.toPaisa()).toBe(33n);

      const sum = parts.reduce((acc, curr) => acc + curr.toPaisa(), 0n);
      expect(sum).toBe(100n);

      // Large split test: 10,000 paisa into 7 parts
      const large = Paisa.fromPaisa(10000);
      const largeParts = large.split(7);
      expect(largeParts).toHaveLength(7);
      const largeSum = largeParts.reduce((acc, curr) => acc + curr.toPaisa(), 0n);
      expect(largeSum).toBe(10000n);

      expect(() => total.split(0)).toThrow(InvalidMoneyAmountError);
      expect(() => total.split(-2)).toThrow(InvalidMoneyAmountError);
    });

    it('calculates basis point percentage with half-up rounding', () => {
      const amount = Paisa.fromBDT('100.00'); // 10,000 paisa
      // 150 bps = 1.5%
      const fee = amount.percentage(150);
      expect(fee.amountPaisa).toBe(150n); // 1.50 BDT

      // 200 bps = 2%
      expect(amount.percentage(200n).toBDT()).toBe('2.00');
    });
  });

  describe('Comparisons & Predicates', () => {
    const a = Paisa.fromBDT('100.00');
    const b = Paisa.fromBDT('200.00');
    const c = Paisa.fromBDT('100.00');
    const neg = Paisa.fromBDT('-50.00');
    const zero = Paisa.zero();

    it('evaluates equality and inequalities', () => {
      expect(a.equals(c)).toBe(true);
      expect(a.equals(b)).toBe(false);
      expect(a.lt(b)).toBe(true);
      expect(b.gt(a)).toBe(true);
      expect(a.lte(c)).toBe(true);
      expect(a.gte(c)).toBe(true);
    });

    it('evaluates isZero, isPositive, isNegative, abs, negate', () => {
      expect(zero.isZero()).toBe(true);
      expect(a.isPositive()).toBe(true);
      expect(neg.isNegative()).toBe(true);
      expect(neg.abs().toBDT()).toBe('50.00');
      expect(a.negate().toBDT()).toBe('-100.00');
    });
  });

  describe('Formatting & South Asian Localization', () => {
    it('formats basic BDT string', () => {
      expect(Paisa.fromBDT('150.75').toBDT()).toBe('150.75');
      expect(Paisa.fromBDT('0.05').toBDT()).toBe('0.05');
      expect(Paisa.fromBDT('-50.00').toBDT()).toBe('-50.00');
    });

    it('formats with South Asian comma grouping (Lakh/Crore)', () => {
      const p = Paisa.fromBDT('150000.00'); // 1.5 Lakh
      expect(p.toFormattedBDT({ useGrouping: true })).toBe('1,50,000.00');

      const crore = Paisa.fromBDT('12345678.90');
      expect(crore.toFormattedBDT({ useGrouping: true })).toBe('1,23,45,678.90');
    });

    it('formats with Bengali numerals and currency symbol', () => {
      const p = Paisa.fromBDT('150000.00');
      const bnFormatted = p.toFormattedBDT({
        locale: 'bn',
        includeSymbol: true,
        useGrouping: true,
      });
      expect(bnFormatted).toBe('৳১,৫০,০০০.০০');

      const withCode = p.toFormattedBDT({
        currencyCode: true,
        includeSymbol: true,
      });
      expect(withCode).toBe('৳1,50,000.00 BDT');
    });

    it('converts to number safely or throws on overflow', () => {
      const p = Paisa.fromBDT('150.75');
      expect(p.toNumber()).toBe(15075);
    });

    it('implements toString and toJSON', () => {
      const p = Paisa.fromBDT('150.75');
      expect(p.toString()).toBe('150.75 BDT');
      expect(p.toJSON()).toBe('150.75');
      expect(JSON.stringify({ amount: p })).toBe('{"amount":"150.75"}');
    });
  });
});
