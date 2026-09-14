import { describe, it, expect } from "vitest";
import {
  Logger,
  withLogContext,
  withSpan,
  HealthCheckRegistry,
  createDatabaseHealthCheck,
  createMemoryHealthCheck,
} from "@denaneya/observability";

describe("Feature 03: Observability Core (Tier 1)", () => {
  it("E2E-T1-F03-01: Structured JSON Logger Output Compliance", () => {
    let output = "";
    const customLogger = new Logger({
      service: "denaneya-test",
      environment: "test",
      minLevel: "info",
      enablePretty: false,
      sink: (line) => {
        output += line;
      },
    });

    customLogger.info("Payment settled", {
      paymentId: "pay_01",
      merchantId: "mer_01",
      amountPaisa: 50000n,
    });

    expect(output).toBeTruthy();
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Payment settled");
    expect(parsed.metadata.paymentId).toBe("pay_01");
    expect(parsed.metadata.merchantId).toBe("mer_01");
    expect(parsed.metadata.amountPaisa).toBe("50000");
    expect(parsed.timestamp).toBeDefined();
  });

  it("E2E-T1-F03-02: Async Correlation ID Propagation Across Context", async () => {
    let capturedLog: any = null;
    const customLogger = new Logger({
      service: "denaneya-test",
      enablePretty: false,
      sink: (line) => {
        capturedLog = JSON.parse(line.trim());
      },
    });

    await withLogContext({ correlationId: "corr_abc123" }, async () => {
      customLogger.info("Nested operation executed");
    });

    expect(capturedLog).toBeDefined();
    expect(capturedLog.correlationId).toBe("corr_abc123");
  });

  it("E2E-T1-F03-03: Sensitive Parameter Masking in Logs", () => {
    let capturedLog: any = null;
    const customLogger = new Logger({
      service: "denaneya-test",
      enablePretty: false,
      sink: (line) => {
        capturedLog = JSON.parse(line.trim());
      },
    });

    customLogger.info("User login attempt", {
      password: "Secret123",
      pin: "1234",
      apiKey: "dn_live_sec_1234567890",
      publicInfo: "user_01",
    });

    expect(capturedLog).toBeDefined();
    expect(capturedLog.metadata.password).toBe("[REDACTED]");
    expect(capturedLog.metadata.pin).toBe("[REDACTED]");
    expect(capturedLog.metadata.apiKey).toBe("[REDACTED]");
    expect(capturedLog.metadata.publicInfo).toBe("user_01");
  });

  it("E2E-T1-F03-04: OpenTelemetry Distributed Trace Span Creation", async () => {
    let spanRan = false;
    const result = await withSpan("payment.settle", async (span) => {
      span.setAttribute("component", "denaneya");
      span.setAttribute("status", "OK");
      spanRan = true;
      return { settled: true };
    });

    expect(spanRan).toBe(true);
    expect(result.settled).toBe(true);
  });

  it("E2E-T1-F03-05: System Health Check Probe Reporting", async () => {
    const registry = new HealthCheckRegistry();
    registry.register("database", createDatabaseHealthCheck(async () => true));
    registry.register("memory", createMemoryHealthCheck());

    const health = await registry.run();
    expect(health.status).toBe("UP");
    expect(health.components.database.status).toBe("UP");
    expect(health.components.memory.status).toBe("UP");
    expect(health.timestamp).toBeDefined();
  });
});
