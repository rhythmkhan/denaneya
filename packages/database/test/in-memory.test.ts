import { describe, it, expect, beforeEach } from 'vitest';
import { eq, desc, and, or, inArray, ilike } from 'drizzle-orm';
import {
  createInMemoryDbClient,
  resetInMemoryStore,
  seedInMemoryStore,
} from '../src/in-memory.js';
import { merchants } from '../src/schema/index.js';

describe('Resilient In-Memory / Simulated Storage Engine', () => {
  let db: ReturnType<typeof createInMemoryDbClient>;

  beforeEach(() => {
    resetInMemoryStore();
    db = createInMemoryDbClient();
  });

  it('performs INSERT and SELECT on in-memory tables', async () => {
    await db.insert(merchants).values({
      id: 'mch_mem_001',
      name: 'Test Merchant Limited',
      businessName: 'test-merchant-biz',
      email: 'merchant@example.com',
      phone: '+8801700000001',
    });

    const results = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_mem_001'));

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('mch_mem_001');
    expect(results[0].name).toBe('Test Merchant Limited');
    expect(results[0].businessName).toBe('test-merchant-biz');
    expect(results[0].email).toBe('merchant@example.com');
  });

  it('performs UPDATE with modified fields and timestamps', async () => {
    await db.insert(merchants).values({
      id: 'mch_mem_002',
      name: 'Old Merchant Name',
      businessName: 'old-merchant-biz',
      email: 'old@example.com',
      phone: '+8801700000002',
    });

    await db
      .update(merchants)
      .set({ name: 'Updated Merchant Name' })
      .where(eq(merchants.id, 'mch_mem_002'));

    const [updated] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_mem_002'));

    expect(updated).toBeDefined();
    expect(updated.name).toBe('Updated Merchant Name');
    expect(updated.businessName).toBe('old-merchant-biz');
  });

  it('performs DELETE on matching rows', async () => {
    await db.insert(merchants).values({
      id: 'mch_mem_003',
      name: 'To Be Deleted',
      businessName: 'delete-biz',
      email: 'delete@example.com',
      phone: '+8801700000003',
    });

    const beforeDelete = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_mem_003'));
    expect(beforeDelete).toHaveLength(1);

    await db.delete(merchants).where(eq(merchants.id, 'mch_mem_003'));

    const afterDelete = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_mem_003'));
    expect(afterDelete).toHaveLength(0);
  });

  it('supports ORDER BY, LIMIT, and OFFSET pagination', async () => {
    await db.insert(merchants).values({ id: 'mch_1', name: 'Alpha', businessName: 'alpha-biz', email: 'a@ex.com', phone: '+8801700000010' });
    await db.insert(merchants).values({ id: 'mch_2', name: 'Beta', businessName: 'beta-biz', email: 'b@ex.com', phone: '+8801700000020' });
    await db.insert(merchants).values({ id: 'mch_3', name: 'Gamma', businessName: 'gamma-biz', email: 'c@ex.com', phone: '+8801700000030' });

    const paged = await db
      .select()
      .from(merchants)
      .orderBy(desc(merchants.name))
      .limit(2)
      .offset(0);

    expect(paged).toHaveLength(2);
    expect(paged[0].name).toBe('Gamma');
    expect(paged[1].name).toBe('Beta');
  });

  it('handles ON CONFLICT DO NOTHING idempotently without error', async () => {
    await db.insert(merchants).values({
      id: 'mch_dup',
      name: 'First Insert',
      businessName: 'dup-biz',
      email: 'dup@example.com',
      phone: '+8801700000099',
    });

    // Duplicate insert with onConflictDoNothing
    await expect(
      db
        .insert(merchants)
        .values({
          id: 'mch_dup',
          name: 'Second Insert (Ignored)',
          businessName: 'dup-biz',
          email: 'dup@example.com',
          phone: '+8801700000099',
        })
        .onConflictDoNothing()
    ).resolves.not.toThrow();

    const [row] = await db.select().from(merchants).where(eq(merchants.id, 'mch_dup'));
    expect(row.name).toBe('First Insert');
  });

  it('commits changes when transaction succeeds', async () => {
    await db.transaction(async (tx) => {
      await tx.insert(merchants).values({
        id: 'mch_tx_ok',
        name: 'Tx Success',
        businessName: 'tx-biz',
        email: 'tx@example.com',
        phone: '+8801700000088',
      });
    });

    const [committed] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_tx_ok'));
    expect(committed).toBeDefined();
    expect(committed.name).toBe('Tx Success');
  });

  it('rolls back in-memory mutations atomically when transaction throws', async () => {
    await db.insert(merchants).values({
      id: 'mch_tx_pre',
      name: 'Pre-existing Merchant',
      businessName: 'pre-biz',
      email: 'pre@example.com',
      phone: '+8801700000077',
    });

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(merchants).values({
          id: 'mch_tx_fail',
          name: 'Should Be Rolled Back',
          businessName: 'fail-biz',
          email: 'fail@example.com',
          phone: '+8801700000066',
        });
        await tx
          .update(merchants)
          .set({ name: 'Mutated In Tx' })
          .where(eq(merchants.id, 'mch_tx_pre'));

        throw new Error('Simulated transaction abortion');
      })
    ).rejects.toThrow('Simulated transaction abortion');

    // 1. Rolled back inserted row must not exist
    const [aborted] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_tx_fail'));
    expect(aborted).toBeUndefined();

    // 2. Pre-existing row mutation must be reverted
    const [pre] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_tx_pre'));
    expect(pre.name).toBe('Pre-existing Merchant');
  });

  it('supports seedInMemoryStore for setting up test fixtures', async () => {
    seedInMemoryStore({
      merchants: [
        {
          id: 'mch_seeded',
          name: 'Seeded Merchant',
          business_name: 'seeded-biz',
          email: 'seed@example.com',
          phone: '+8801700000055',
        },
      ],
    });

    const [seeded] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, 'mch_seeded'));
    expect(seeded).toBeDefined();
    expect(seeded.id).toBe('mch_seeded');
  });

  it('responds to SELECT 1 ping health queries', async () => {
    const result = await (db as any).execute('SELECT 1');
    expect(result.rowCount).toBe(1);
    expect(result.rows).toBeDefined();
  });

  it('strictly enforces Boolean operator precedence (AND > OR) to prevent tenant data leakage', async () => {
    // Insert records for two different merchants
    await db.insert(merchants).values({
      id: 'mch_tenant_A',
      name: 'Tenant A Merchant',
      businessName: 'tenant-a',
      email: 'a@tenant.com',
      phone: '+8801700000001',
      status: 'ACTIVE',
    });

    await db.insert(merchants).values({
      id: 'mch_tenant_B',
      name: 'Tenant B Merchant',
      businessName: 'tenant-b',
      email: 'b@tenant.com',
      phone: '+8801700000002',
      status: 'ACTIVE',
    });

    // Query scoped to Tenant A with an OR status check:
    // (id = 'mch_tenant_A' AND (status = 'ACTIVE' OR status = 'PENDING'))
    const result = await db
      .select()
      .from(merchants)
      .where(
        and(
          eq(merchants.id, 'mch_tenant_A'),
          or(eq(merchants.status, 'ACTIVE'), eq(merchants.status, 'SUSPENDED'))
        )
      );

    // MUST NOT leak Tenant B's data despite Tenant B also having status = 'ACTIVE'
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mch_tenant_A');
  });

  it('supports inArray filtering', async () => {
    await db.insert(merchants).values({ id: 'mch_in_1', name: 'In 1', businessName: 'in1', email: '1@in.com', phone: '+8801700000091' });
    await db.insert(merchants).values({ id: 'mch_in_2', name: 'In 2', businessName: 'in2', email: '2@in.com', phone: '+8801700000092' });
    await db.insert(merchants).values({ id: 'mch_in_3', name: 'In 3', businessName: 'in3', email: '3@in.com', phone: '+8801700000093' });

    const selected = await db
      .select()
      .from(merchants)
      .where(inArray(merchants.id, ['mch_in_1', 'mch_in_3']));

    expect(selected).toHaveLength(2);
    const ids = selected.map((s) => s.id);
    expect(ids).toContain('mch_in_1');
    expect(ids).toContain('mch_in_3');
    expect(ids).not.toContain('mch_in_2');
  });

  it('supports ilike substring pattern matching', async () => {
    await db.insert(merchants).values({ id: 'mch_search_1', name: 'Dhaka Superstore', businessName: 'dhaka-sup', email: 'dhaka@sup.com', phone: '+8801700000081' });
    await db.insert(merchants).values({ id: 'mch_search_2', name: 'Chittagong Trader', businessName: 'ctg-trd', email: 'ctg@trd.com', phone: '+8801700000082' });

    const matched = await db
      .select()
      .from(merchants)
      .where(ilike(merchants.name, '%superstore%'));

    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('mch_search_1');
  });

  it('provides working withRetry resilience wrapper on in-memory db', async () => {
    const outcome = await (db as any).withRetry(async () => {
      return 'resilient_in_memory_result';
    });
    expect(outcome).toBe('resilient_in_memory_result');
  });
});

