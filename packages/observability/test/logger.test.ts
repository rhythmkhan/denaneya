import { describe, it, expect, vi } from 'vitest';
import { Logger, withLogContext, jsonReplacer } from '../src/logger.js';
import type { LogSeverity, StructuredLogEntry } from '../src/types.js';

describe('Logger', () => {
  it('T1.1: produces structured JSON output with all mandatory fields', () => {
    const logs: StructuredLogEntry[] = [];
    const testSink = (line: string) => {
      logs.push(JSON.parse(line));
    };

    const logger = new Logger({
      service: 'test-service',
      environment: 'production',
      minLevel: 'info',
      enablePretty: false,
      sink: testSink,
    });

    logger.info('System startup initiated', { port: 8080 });

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('System startup initiated');
    expect(entry.service).toBe('test-service');
    expect(entry.environment).toBe('production');
    expect(entry.timestamp).toBeDefined();
    expect(entry.metadata).toEqual({ port: 8080 });
  });

  it('T1.2: filters log entries below configured minLevel', () => {
    const lines: string[] = [];
    const logger = new Logger({
      minLevel: 'warn',
      enablePretty: false,
      sink: (line) => lines.push(line),
    });

    logger.trace('Trace level message');
    logger.debug('Debug level message');
    logger.info('Info level message');
    expect(lines).toHaveLength(0);

    logger.warn('Warning level message');
    logger.error('Error level message');
    expect(lines).toHaveLength(2);
  });

  it('T1.3: propagates context via withLogContext (AsyncLocalStorage)', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      minLevel: 'debug',
      sink: (line) => logs.push(JSON.parse(line)),
    });

    withLogContext(
      {
        correlationId: 'corr_abc123',
        requestId: 'req_xyz789',
        merchantId: 'mch_sandbox_demo',
        paymentId: 'pay_998877',
      },
      () => {
        logger.info('Payment processing begun');
      }
    );

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.correlationId).toBe('corr_abc123');
    expect(entry.requestId).toBe('req_xyz789');
    expect(entry.merchantId).toBe('mch_sandbox_demo');
    expect(entry.paymentId).toBe('pay_998877');
  });

  it('T1.4: child logger retains parent configuration and binds additional context', () => {
    const logs: StructuredLogEntry[] = [];
    const parent = new Logger({
      service: 'payment-engine',
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const child = parent.child({ merchantId: 'mch_child_123', deviceId: 'dev_android_456' });
    child.info('Device heartbeat received');

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.merchantId).toBe('mch_child_123');
    expect(entry.deviceId).toBe('dev_android_456');
    expect(entry.service).toBe('payment-engine');
  });

  it('T1.5: automatically redacts sensitive fields in metadata', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    logger.info('Sensitive credentials payload', {
      password: 'PlainPassword123!',
      token: 'secret_jwt_token_here',
      card_number: '4111222233334444',
      pin: '1234',
      otp: '654321',
      nested: {
        api_key: 'dn_live_sec_abcdef',
        safe_param: 'public_value',
      },
    });

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.password).toBe('[REDACTED]');
    expect(meta.token).toBe('[REDACTED]');
    expect(meta.card_number).toBe('[REDACTED]');
    expect(meta.pin).toBe('[REDACTED]');
    expect(meta.otp).toBe('[REDACTED]');
    expect(meta.nested.api_key).toBe('[REDACTED]');
    expect(meta.nested.safe_param).toBe('public_value');
  });

  it('T1.6: serializes Error objects with stack and name', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const error = new Error('Gateway timeout connection refused');
    (error as any).code = 'ETIMEDOUT';

    logger.error('Payment gateway call failed', error);

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.level).toBe('error');
    expect(entry.error).toBeDefined();
    expect(entry.error!.name).toBe('Error');
    expect(entry.error!.message).toBe('Gateway timeout connection refused');
    expect(entry.error!.code).toBe('ETIMEDOUT');
    expect(entry.error!.stack).toBeDefined();
  });

  it('T1.7: supports fatal, trace, and pretty-printing mode', () => {
    const lines: string[] = [];
    const prettyLogger = new Logger({
      enablePretty: true,
      minLevel: 'trace',
      sink: (line) => lines.push(line),
    });

    prettyLogger.trace('Trace detail');
    prettyLogger.debug('Debug detail');
    prettyLogger.fatal('Fatal system crash', new Error('OOM error'), { core: 1 });

    expect(lines.length).toBe(3);
    expect(lines[2]).toContain('FATAL');
    expect(lines[2]).toContain('OOM error');
  });

  it('T1.8: serializes BigInt paisa amounts and large 64-bit integers without throwing', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    logger.info('Payment capture settlement', {
      amountPaisa: 50000n,
      feePaisa: 250n,
      largeInt64: 9007199254740992000n,
      nested: {
        subtotalPaisa: 49750n,
      },
    });

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.amountPaisa).toBe('50000');
    expect(meta.feePaisa).toBe('250');
    expect(meta.largeInt64).toBe('9007199254740992000');
    expect(meta.nested.subtotalPaisa).toBe('49750');
  });

  it('T1.9: serializes BigInt in ambient LogContext safely', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    withLogContext({ sequenceNumber: 123456789012345n } as any, () => {
      logger.info('Context with BigInt');
    });

    expect(logs).toHaveLength(1);
    expect((logs[0] as any).sequenceNumber).toBe('123456789012345');
  });

  it('T1.10: detects circular references in metadata and replaces with [Circular]', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const circularObj: Record<string, any> = { name: 'cyclic-node' };
    circularObj.self = circularObj;
    circularObj.nested = { parent: circularObj };

    expect(() => {
      logger.info('Graph traversal event', circularObj);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.name).toBe('cyclic-node');
    expect(meta.self).toBe('[Circular]');
    expect(meta.nested.parent).toBe('[Circular]');
  });

  it('T1.11: truncates object graphs exceeding max depth with [Truncated]', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const deepObj = {
      l1: { l2: { l3: { l4: { l5: { l6: { l7: 'too-deep-value' } } } } } },
    };

    logger.debug('Deeply nested payload', deepObj);

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.l1.l2.l3.l4.l5.l6).toBe('[Truncated]');
  });

  it('T1.12: preserves shared references across non-circular DAGs', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const sharedSubtree = { id: 'shared_branch', count: 42 };
    const dag = {
      branchA: sharedSubtree,
      branchB: sharedSubtree,
    };

    logger.info('DAG payload', dag);

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.branchA.id).toBe('shared_branch');
    expect(meta.branchB.id).toBe('shared_branch');
    expect(meta.branchB).not.toBe('[Circular]');
  });

  it('T1.13: handles throwing property getters defensively with [UnreadableProperty]', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const hostileObj = {
      get explosive() {
        throw new Error('Explosive getter failure');
      },
      healthy: 'active',
    };

    expect(() => {
      logger.warn('Hostile metadata object', hostileObj);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as Record<string, any>;
    expect(meta.explosive).toBe('[UnreadableProperty]');
    expect(meta.healthy).toBe('active');
  });

  it('T1.14: formats BigInt and circular structures in pretty-printing mode without throwing', () => {
    const lines: string[] = [];
    const prettyLogger = new Logger({
      enablePretty: true,
      minLevel: 'info',
      sink: (line) => lines.push(line),
    });

    const cycle: Record<string, any> = { amountPaisa: 75000n };
    cycle.ref = cycle;

    expect(() => {
      prettyLogger.info('Pretty log with BigInt and cycle', cycle);
    }).not.toThrow();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('75000');
    expect(lines[0]).toContain('[Circular]');
  });

  it('T1.15: handles mutual circular Error cause chains without stack overflow (errA <-> errB)', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const errA = new Error('Gateway connection failure');
    const errB = new Error('Upstream socket hangup');
    (errA as any).cause = errB;
    (errB as any).cause = errA;

    expect(() => {
      logger.error('Payment processing encountered circular error', errA);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.error).toBeDefined();
    expect(entry.error!.message).toBe('Gateway connection failure');
    const causeB = entry.error!.cause as any;
    expect(causeB).toBeDefined();
    expect(causeB.message).toBe('Upstream socket hangup');
    const causeCircularA = causeB.cause as any;
    expect(causeCircularA).toBeDefined();
    expect(causeCircularA.message).toBe('[CircularError]');
  });

  it('T1.16: handles self-referencing Error cause without stack overflow (err.cause = err)', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const errSelf = new Error('Self referencing database error');
    (errSelf as any).cause = errSelf;

    expect(() => {
      logger.error('Database connection failed', errSelf);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.error).toBeDefined();
    expect(entry.error!.message).toBe('Self referencing database error');
    const causeSelf = entry.error!.cause as any;
    expect(causeSelf).toBeDefined();
    expect(causeSelf.message).toBe('[CircularError]');
  });

  it('T1.17: truncates deeply nested Error cause chains exceeding maxDepth with [TruncatedError]', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    let root = new Error('Root cause chain error 0');
    let curr: any = root;
    for (let i = 1; i <= 15; i++) {
      const next = new Error(`Nested cause level ${i}`);
      curr.cause = next;
      curr = next;
    }

    expect(() => {
      logger.error('Deep error cause chain', root);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    let step: any = logs[0]!.error;
    let foundTruncated = false;
    for (let d = 0; d <= 12; d++) {
      if (step?.message === '[TruncatedError]') {
        foundTruncated = true;
        break;
      }
      step = step?.cause;
    }
    expect(foundTruncated).toBe(true);
  });

  it('T1.18: defensively handles hostile throwing property getters on Error objects', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const hostileErr = new Error('Base error message');
    Object.defineProperty(hostileErr, 'message', {
      get() {
        throw new Error('Hostile getter on Error.message exploded');
      },
    });
    Object.defineProperty(hostileErr, 'name', {
      get() {
        throw new Error('Hostile getter on Error.name exploded');
      },
    });
    Object.defineProperty(hostileErr, 'stack', {
      get() {
        throw new Error('Hostile getter on Error.stack exploded');
      },
    });
    Object.defineProperty(hostileErr, 'code', {
      get() {
        throw new Error('Hostile getter on Error.code exploded');
      },
    });
    Object.defineProperty(hostileErr, 'cause', {
      get() {
        throw new Error('Hostile getter on Error.cause exploded');
      },
    });

    expect(() => {
      logger.error('Logging completely hostile error object', hostileErr);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.error).toBeDefined();
    expect(entry.error!.name).toBe('Error');
    expect(entry.error!.message).toBe('[UnreadableMessage]');
    expect(entry.error!.cause).toBe('[UnreadableCause]');
  });

  it('T1.19: falls back to ErrorSerializationFailed if error serialization encounters fatal error', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const hostileError = new Error('Original uncooperative error');
    vi.spyOn(logger as any, 'serializeError').mockImplementationOnce(() => {
      throw new Error('Trap exploded during error serialization');
    });

    expect(() => {
      logger.error('Logging uncooperative error proxy', hostileError);
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const entry = logs[0]!;
    expect(entry.error).toBeDefined();
    expect(entry.error!.name).toBe('ErrorSerializationFailed');
    expect(entry.error!.message).toContain('Trap exploded');
  });

  it('T1.20: safely serializes cyclic errors embedded in metadata', () => {
    const logs: StructuredLogEntry[] = [];
    const logger = new Logger({
      enablePretty: false,
      sink: (line) => logs.push(JSON.parse(line)),
    });

    const cyclicErr = new Error('Cyclic error in metadata');
    (cyclicErr as any).cause = cyclicErr;

    expect(() => {
      logger.info('Metadata carrying cyclic error', { errorContext: cyclicErr });
    }).not.toThrow();

    expect(logs).toHaveLength(1);
    const meta = logs[0]!.metadata as any;
    expect(meta.errorContext).toBeDefined();
    expect(meta.errorContext.message).toBe('Cyclic error in metadata');
    expect(meta.errorContext.cause.message).toBe('[CircularError]');
  });
});
