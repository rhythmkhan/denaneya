import { describe, it, expect } from "vitest";
import { Paisa, NegativeAmountError, FloatingPointArithmeticError } from "@denaneya/payment-core";

describe("Feature 05: Money Math (Paisa Minor Units) (Tier 1)", () => {
  it("E2E-T1-F05-01: Precise BDT String to Paisa BigInt Conversion", () => {
    const money = Paisa.fromBDT("1250.75");
    expect(money.toPaisa()).toBe(125075n);
    expect(money.toBDT()).toBe("1250.75");
  });

  it("E2E-T1-F05-02: Lossless Integer Minor Unit Addition & Subtraction", () => {
    const a = Paisa.fromBDT("100.50");
    const b = Paisa.fromBDT("50.25");
    const c = Paisa.fromBDT("25.00");

    const result = a.add(b).subtract(c);
    expect(result.toPaisa()).toBe(12575n);
    expect(result.toBDT()).toBe("125.75");
  });

  it("E2E-T1-F05-03: Strict Rejection of Floating-Point Inputs", () => {
    expect(() => Paisa.fromPaisa(1250.75 as any)).toThrow(FloatingPointArithmeticError);
  });

  it("E2E-T1-F05-04: Integer-Safe MDR Fee Calculation with Half-Up Rounding", () => {
    const amountPaisa = 150000n; // 1,500.00 BDT
    const bps = 185n; // 1.85%
    const feePaisa = (amountPaisa * bps + 5000n) / 10000n;

    expect(feePaisa).toBe(2775n); // 27.75 BDT
    const fee = Paisa.fromPaisa(feePaisa);
    expect(fee.toBDT()).toBe("27.75");
  });

  it("E2E-T1-F05-05: Negative Subtraction Protection", () => {
    const smaller = Paisa.fromBDT("100.00");
    const larger = Paisa.fromBDT("200.00");

    expect(() => smaller.subtract(larger)).toThrow(NegativeAmountError);
  });
});
