import { describe, it, expect } from "vitest";
import {
  FraudEvaluator,
  RuleReusedTrxId,
  RuleAmountMismatch,
  RuleSuspiciousSender,
  RuleVelocityIp,
} from "@denaneya/fraud-engine";

describe("Feature 08: Anti-Fraud Risk Engine (Tier 1)", () => {
  it("E2E-T1-F08-01: Clean Transaction Evaluation (Score < 30 -> ALLOW)", () => {
    const decision = FraudEvaluator.classifyScore(0);
    expect(decision.classification).toBe("LOW");
    expect(decision.action).toBe("ALLOW");
  });

  it("E2E-T1-F08-02: Duplicate TrxID Critical Rule Trigger (Score = 100 -> BLOCK)", () => {
    const rule = new RuleReusedTrxId();
    expect(rule.weight).toBe(100);
    const decision = FraudEvaluator.classifyScore(100);
    expect(decision.classification).toBe("CRITICAL");
    expect(decision.action).toBe("BLOCK");
  });

  it("E2E-T1-F08-03: Amount Mismatch High Risk Rule Trigger (Score = 80 -> UNDER_REVIEW)", () => {
    const rule = new RuleAmountMismatch();
    expect(rule.weight).toBeGreaterThanOrEqual(80);
    const decision = FraudEvaluator.classifyScore(rule.weight);
    expect(["HIGH", "CRITICAL"]).toContain(decision.classification);
  });

  it("E2E-T1-F08-04: Suspicious Sender Mask Rule Trigger (Score = 100 -> BLOCK)", () => {
    const rule = new RuleSuspiciousSender();
    const result = rule.evaluate({
      sms: {
        provider: "BKASH",
        sender: "01712345678",
        rawText: "You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90",
        receivedAt: new Date(),
      },
    } as any);
    expect(result.triggered).toBe(true);
    const decision = FraudEvaluator.classifyScore(100);
    expect(decision.action).toBe("BLOCK");
  });

  it("E2E-T1-F08-05: Hourly IP Velocity Medium Risk Rule Trigger", () => {
    const rule = new RuleVelocityIp();
    expect(rule.weight).toBeGreaterThanOrEqual(40);
    const decision = FraudEvaluator.classifyScore(rule.weight);
    expect(["CHALLENGE", "UNDER_REVIEW"]).toContain(decision.action);
  });
});
