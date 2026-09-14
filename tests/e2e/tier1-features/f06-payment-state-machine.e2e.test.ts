import { describe, it, expect } from "vitest";
import {
  validatePaymentTransition,
  canTransition,
} from "@denaneya/payment-core";

describe("Feature 06: Payment State Machine (Tier 1)", () => {
  it("E2E-T1-F06-01: Happy Path State Lifecycle: CREATED to COMPLETED", () => {
    expect(validatePaymentTransition("CREATED", "PENDING").allowed).toBe(true);
    expect(validatePaymentTransition("PENDING", "PROCESSING").allowed).toBe(true);
    expect(validatePaymentTransition("PROCESSING", "COMPLETED").allowed).toBe(true);
  });

  it("E2E-T1-F06-02: Interactive Checkout Lifecycle: CREATED to REQUIRES_ACTION to PROCESSING", () => {
    expect(validatePaymentTransition("CREATED", "REQUIRES_ACTION").allowed).toBe(true);
    expect(validatePaymentTransition("REQUIRES_ACTION", "PROCESSING").allowed).toBe(true);
    expect(validatePaymentTransition("PROCESSING", "COMPLETED").allowed).toBe(true);
  });

  it("E2E-T1-F06-03: Rejection of Backward Transition: COMPLETED to PENDING", () => {
    const res = validatePaymentTransition("COMPLETED", "PENDING");
    expect(res.allowed).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("E2E-T1-F06-04: Fraud Interception Path: PENDING to UNDER_REVIEW to COMPLETED", () => {
    expect(validatePaymentTransition("PENDING", "UNDER_REVIEW").allowed).toBe(true);
    expect(
      validatePaymentTransition("UNDER_REVIEW", "COMPLETED", {
        dualControlAuthorized: true,
      }).allowed
    ).toBe(true);
  });

  it("E2E-T1-F06-05: Terminal Refund Lifecycle: COMPLETED to PARTIALLY_REFUNDED to REFUNDED", () => {
    expect(validatePaymentTransition("COMPLETED", "PARTIALLY_REFUNDED").allowed).toBe(true);
    expect(validatePaymentTransition("PARTIALLY_REFUNDED", "REFUNDED").allowed).toBe(true);
  });
});
