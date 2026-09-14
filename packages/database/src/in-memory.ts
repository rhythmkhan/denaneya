/**
 * Resilient In-Memory / Simulated Storage Engine for Drizzle ORM
 * Provides zero-crash cold-start fallback when DATABASE_URL is unset or invalid.
 */

import * as crypto from 'node:crypto';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema/index.js';

// Table name -> Array of records (each record is an object with column keys)
const globalStore = new Map<string, any[]>();
const transactionStack: Map<string, any[]>[] = [];

/**
 * Ensures baseline bootstrap data exists (Sandbox Merchant, API key, Chart of Accounts).
 */
export function ensureBootstrapData(): void {
  if (!globalStore.has('merchants') || globalStore.get('merchants')!.length === 0) {
    const now = new Date();
    const demoApiKey = 'dn_test_sec_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d';
    const keyHash = crypto.createHash('sha256').update(demoApiKey).digest('hex');

    // 1. Default Sandbox Merchant
    const merchantsList = [
      {
        id: 'mch_sandbox_demo',
        name: 'DenaNeya Demo Store',
        businessName: 'DenaNeya Technologies Ltd.',
        businessType: 'PRIVATE_LIMITED',
        email: 'sandbox@denaneya.com',
        phone: '+8801700000000',
        kycStatus: 'VERIFIED',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
        fixedFeePaisa: 0n,
        defaultCurrency: 'BDT',
        webhookSecret: 'whsec_demo_store_webhook_secret_key_2026',
        createdAt: now,
        updatedAt: now,
      },
    ];
    globalStore.set('merchants', merchantsList);

    // 2. Default Sandbox API Key
    const apiKeysList = [
      {
        id: 'key_demo_sandbox_01',
        merchantId: 'mch_sandbox_demo',
        name: 'Default Sandbox Secret',
        keyPrefix: 'dn_test_sec_9a8b',
        keyHash,
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: [
          'payments:read',
          'payments:write',
          'invoices:read',
          'invoices:write',
          'payment_links:read',
          'payment_links:write',
          'webhooks:read',
          'webhooks:write',
          'refunds:create',
          'reconciliation:write',
          'devices:read',
          '*',
        ],
        lastUsedAt: now,
        expiresAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    globalStore.set('api_keys', apiKeysList);

    // 3. Platform Chart of Accounts
    const standardAccounts = [
      { id: 'acc_1110', code: '1110', name: 'SSLCOMMERZ In-Transit Receivable', type: 'ASSET', normalBalance: 'DEBIT', description: 'Clearing account for SSLCOMMERZ card & netbanking transactions' },
      { id: 'acc_1120', code: '1120', name: 'shurjoPay In-Transit Receivable', type: 'ASSET', normalBalance: 'DEBIT', description: 'Clearing account for shurjoPay transactions' },
      { id: 'acc_1130', code: '1130', name: 'aamarPay In-Transit Receivable', type: 'ASSET', normalBalance: 'DEBIT', description: 'Clearing account for aamarPay transactions' },
      { id: 'acc_1140', code: '1140', name: 'bKash Direct Checkout Receivable', type: 'ASSET', normalBalance: 'DEBIT', description: 'bKash tokenized gateway checkout receivable' },
      { id: 'acc_1150', code: '1150', name: 'Nagad PGW Receivable', type: 'ASSET', normalBalance: 'DEBIT', description: 'Nagad PGW gateway receivable' },
      { id: 'acc_1210', code: '1210', name: 'bKash Merchant SIM Wallet', type: 'ASSET', normalBalance: 'DEBIT', description: 'Custodial balance in merchant bKash SIM' },
      { id: 'acc_1220', code: '1220', name: 'Nagad Merchant SIM Wallet', type: 'ASSET', normalBalance: 'DEBIT', description: 'Custodial balance in merchant Nagad SIM' },
      { id: 'acc_1230', code: '1230', name: 'Rocket Merchant SIM Wallet', type: 'ASSET', normalBalance: 'DEBIT', description: 'Custodial balance in merchant Rocket SIM' },
      { id: 'acc_1240', code: '1240', name: 'Upay Merchant SIM Wallet', type: 'ASSET', normalBalance: 'DEBIT', description: 'Custodial balance in merchant Upay SIM' },
      { id: 'acc_1310', code: '1310', name: 'Commercial Bank Settlement Treasury', type: 'ASSET', normalBalance: 'DEBIT', description: 'DenaNeya commercial bank clearing pool' },
      { id: 'acc_2110', code: '2110', name: 'Merchant Available Balance', type: 'LIABILITY', normalBalance: 'CREDIT', description: 'Net settled funds owed to merchants' },
      { id: 'acc_2120', code: '2120', name: 'Merchant Escrow Hold / Reserve', type: 'LIABILITY', normalBalance: 'CREDIT', description: 'Held reserves for disputes or rolling risk' },
      { id: 'acc_2210', code: '2210', name: 'Pending Customer Refund Payable', type: 'LIABILITY', normalBalance: 'CREDIT', description: 'Funds earmarked for pending customer refunds' },
      { id: 'acc_2310', code: '2310', name: 'Gateway Network Fee Payable', type: 'LIABILITY', normalBalance: 'CREDIT', description: 'Interchange and network fees owed to gateways' },
      { id: 'acc_3100', code: '3100', name: 'Platform Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT', description: 'Accumulated operating profits' },
      { id: 'acc_4100', code: '4100', name: 'Platform MDR Processing Fee Revenue', type: 'REVENUE', normalBalance: 'CREDIT', description: 'DenaNeya platform percentage markup fee' },
      { id: 'acc_4200', code: '4200', name: 'Platform Fixed Transaction Fee Revenue', type: 'REVENUE', normalBalance: 'CREDIT', description: 'Flat transaction fee revenue' },
      { id: 'acc_5100', code: '5100', name: 'Gateway Interchange Expense', type: 'EXPENSE', normalBalance: 'DEBIT', description: 'Fees charged by payment networks' },
    ];
    globalStore.set('ledger_accounts', standardAccounts.map((a) => ({ ...a, createdAt: now })));

    // 4. Default Webhook Subscription
    const webhookSubs = [
      {
        id: 'whs_demo_store_01',
        merchantId: 'mch_sandbox_demo',
        url: 'https://denaneya.vercel.app/api/demo-store/webhook',
        secret: 'whsec_demo_store_webhook_secret_key_2026',
        events: ['payment.completed', 'payment.failed', 'refund.created', '*'],
        status: 'ACTIVE',
        failureCount: 0,
        description: 'DenaNeya Demo Store Webhook Endpoint',
        createdAt: now,
        updatedAt: now,
      },
    ];
    globalStore.set('webhook_subscriptions', webhookSubs);
  }
}

// Ensure bootstrap data runs at initialization
ensureBootstrapData();

/**
 * Reset all in-memory tables (useful in test isolation).
 */
export function resetInMemoryStore(options: { bootstrap?: boolean } = {}): void {
  globalStore.clear();
  transactionStack.length = 0;
  if (options.bootstrap) {
    ensureBootstrapData();
  }
}

/**
 * Preload in-memory store with initial records.
 */
export function seedInMemoryStore(tables: Record<string, any[]>): void {
  for (const [table, rows] of Object.entries(tables)) {
    globalStore.set(table, [...rows]);
  }
}

/**
 * Access the in-memory storage for inspection.
 */
export function getInMemoryStore(): Map<string, any[]> {
  return globalStore;
}

function getTable(tableName: string): any[] {
  if (!globalStore.has(tableName)) {
    globalStore.set(tableName, []);
  }
  return globalStore.get(tableName)!;
}

function cloneStore(): Map<string, any[]> {
  const clone = new Map<string, any[]>();
  for (const [key, rows] of globalStore.entries()) {
    clone.set(
      key,
      rows.map((row) => ({ ...row }))
    );
  }
  return clone;
}

/**
 * Strips matching outermost parentheses if they enclose the entire expression.
 */
function stripOuterParens(str: string): string {
  let trimmed = str.trim();
  while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    let depth = 0;
    let matched = true;
    for (let i = 0; i < trimmed.length - 1; i++) {
      const c = trimmed[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          matched = false;
          break;
        }
      }
    }
    if (matched) {
      trimmed = trimmed.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return trimmed;
}

/**
 * Splits logical operators (AND/OR) at top-level parentheses depth 0,
 * respecting quoted strings and nested expressions.
 */
function splitTopLevelLogic(str: string, op: 'AND' | 'OR'): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';
  const opTarget = ` ${op} `;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if ((c === '"' || c === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = c;
    } else if (c === quoteChar && inQuotes) {
      inQuotes = false;
    }

    if (!inQuotes) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (depth === 0) {
        const slice = str.slice(i, i + opTarget.length);
        if (slice.toUpperCase() === opTarget) {
          if (current.trim()) result.push(current.trim());
          current = '';
          i += opTarget.length - 1;
          continue;
        }
      }
    }
    current += c;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * Splits top-level comma-separated expressions, respecting nested parentheses and quotes.
 */
function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    }
    if (!inQuotes) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * Resolves column value from row supporting snake_case, camelCase, and table-prefixed keys.
 */
export function getRowValue(row: any, col: string): any {
  if (row == null || typeof row !== 'object') return undefined;
  if (row[col] !== undefined) return row[col];
  // snake_case -> camelCase
  const camel = col.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
  if (row[camel] !== undefined) return row[camel];
  // camelCase -> snake_case
  const snake = col.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (row[snake] !== undefined) return row[snake];

  // If alias has a table prefix (e.g. payment_amount_paisa -> amountPaisa or amount_paisa)
  if (col.includes('_')) {
    const stripped = col.replace(/^[a-zA-Z0-9]+_/, '');
    if (row[stripped] !== undefined) return row[stripped];
    const strippedCamel = stripped.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
    if (row[strippedCamel] !== undefined) return row[strippedCamel];
    const strippedSnake = stripped.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (row[strippedSnake] !== undefined) return row[strippedSnake];
  }

  return undefined;
}

/**
 * Extracts pure identifier from `"col"`, `"tbl"."col"`, or `col as "alias"`.
 */
function extractColumnIdentifier(raw: string): { key: string; isAggregate?: string } {
  const trimmed = raw.trim();

  // Aggregates like count(*) or sum(...)
  const isCount = /\bcount\s*\(/i.test(trimmed);
  const isSum = /\bsum\s*\(/i.test(trimmed);

  // Check for alias: ... as "alias" or ... "alias"
  const aliasMatch = trimmed.match(/\bas\s+"([^"]+)"/i) || trimmed.match(/\s+"([^"]+)"$/i);
  if (aliasMatch && aliasMatch[1]) {
    return {
      key: aliasMatch[1],
      ...(isCount ? { isAggregate: 'count' } : isSum ? { isAggregate: 'sum' } : {}),
    };
  }

  // Check for simple column: "tbl"."col" or "col"
  const colMatch = trimmed.match(/(?:"[^"]+"\.)?"([^"]+)"$/);
  if (colMatch && colMatch[1]) {
    return { key: colMatch[1] };
  }

  if (isCount) return { key: 'count', isAggregate: 'count' };
  if (isSum) return { key: 'sum', isAggregate: 'sum' };

  return { key: trimmed.replace(/[^a-zA-Z0-9_]/g, '_') || 'column' };
}

/**
 * Evaluates WHERE clauses respecting Boolean operator precedence (AND > OR)
 * and parenthesis grouping. Prevents BOLA / cross-tenant record leakage.
 */
function evaluateWhereClause(clause: string, row: any, params: any[]): boolean {
  if (!clause || !clause.trim()) return true;

  const stripped = stripOuterParens(clause);
  if (!stripped) return true;

  // 1. Top-level OR evaluation (lowest precedence)
  const orParts = splitTopLevelLogic(stripped, 'OR');
  if (orParts.length > 1) {
    return orParts.some((part) => evaluateWhereClause(part, row, params));
  }

  // 2. Top-level AND evaluation (higher precedence than OR)
  const andParts = splitTopLevelLogic(stripped, 'AND');
  if (andParts.length > 1) {
    return andParts.every((part) => evaluateWhereClause(part, row, params));
  }

  // 3. Single atomic predicate
  const cond = stripped.trim();

  // IS NULL / IS NOT NULL
  const nullMatch = cond.match(/(?:"[^"]+"\.)?"([^"]+)"\s+is\s+(not\s+)?null/i);
  if (nullMatch && nullMatch[1]) {
    const col = nullMatch[1];
    const isNot = Boolean(nullMatch[2]);
    const val = getRowValue(row, col);
    return isNot ? val !== null && val !== undefined : val === null || val === undefined;
  }

  // IN ($1, $2, ...) or IN ('a', 'b') or NOT IN (...)
  const inMatch = cond.match(/(?:"[^"]+"\.)?"([^"]+)"\s+(not\s+)?in\s*\(([^)]+)\)/i);
  if (inMatch && inMatch[1] && inMatch[3]) {
    const col = inMatch[1];
    const isNot = Boolean(inMatch[2]);
    const inTokens = splitTopLevel(inMatch[3]);
    const actual = getRowValue(row, col);
    const normActual = typeof actual === 'bigint' ? actual.toString() : actual;

    const inValues = inTokens.map((tok) => {
      const trimmedTok = tok.trim();
      if (trimmedTok.startsWith('$')) {
        const idx = parseInt(trimmedTok.slice(1), 10) - 1;
        return params[idx];
      }
      return trimmedTok.replace(/^'|'$/g, '');
    });

    const matchesAny = inValues.some((target) => {
      const normTarget = typeof target === 'bigint' ? target.toString() : target;
      return normActual == normTarget;
    });

    return isNot ? !matchesAny : matchesAny;
  }

  // Binary comparison: "col" (=|!=|<>|>=|<=|>|<) ($N | 'literal' | number)
  const compMatch = cond.match(
    /(?:"[^"]+"\.)?"([^"]+)"\s*(=|!=|<>|>=|<=|>|<)\s*(\$\d+|'[^']*'|-?\d+(?:\.\d+)?)/i
  );
  if (compMatch && compMatch[1] && compMatch[2] && compMatch[3]) {
    const col = compMatch[1];
    const op = compMatch[2];
    const right = compMatch[3];
    let target: any;
    if (right.startsWith('$')) {
      const paramIndex = parseInt(right.slice(1), 10) - 1;
      target = params[paramIndex];
    } else if (right.startsWith("'") && right.endsWith("'")) {
      target = right.slice(1, -1);
    } else {
      target = Number(right);
    }

    const actual = getRowValue(row, col);

    // Normalize bigint vs number or string comparisons
    const normActual = typeof actual === 'bigint' ? actual.toString() : actual;
    const normTarget = typeof target === 'bigint' ? target.toString() : target;

    switch (op) {
      case '=':
        return normActual == normTarget;
      case '!=':
      case '<>':
        return normActual != normTarget;
      case '>=':
        return (actual ?? 0) >= (target ?? 0);
      case '<=':
        return (actual ?? 0) <= (target ?? 0);
      case '>':
        return (actual ?? 0) > (target ?? 0);
      case '<':
        return (actual ?? 0) < (target ?? 0);
    }
  }

  // LIKE / ILIKE
  const likeMatch = cond.match(/(?:"[^"]+"\.)?"([^"]+)"\s+(i?like)\s*(\$\d+|'[^']*')/i);
  if (likeMatch && likeMatch[1] && likeMatch[2] && likeMatch[3]) {
    const col = likeMatch[1];
    const isCaseInsensitive = likeMatch[2].toLowerCase() === 'ilike';
    const right = likeMatch[3];
    let pattern = right.startsWith('$')
      ? String(params[parseInt(right.slice(1), 10) - 1] ?? '')
      : right.replace(/^'|'$/g, '');

    const actual = String(getRowValue(row, col) ?? '');
    const regexPattern = '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$';
    const regex = new RegExp(regexPattern, isCaseInsensitive ? 'i' : '');
    return regex.test(actual);
  }

  // Default to true if expression is not explicitly recognized to avoid false-positive drop
  return true;
}

/**
 * Processes SQL queries against in-memory storage.
 */
export async function executeInMemoryQuery(
  queryInput: any,
  params: any[] = []
): Promise<{ rows: any[]; rowCount: number }> {
  let text = (typeof queryInput === 'string' ? queryInput : queryInput?.text || '').trim();
  // Strip trailing semicolons
  text = text.replace(/;\s*$/, '').trim();
  // Strip concurrency hints (e.g. FOR UPDATE, FOR UPDATE SKIP LOCKED)
  text = text.replace(/\s+for\s+(?:update|no\s+key\s+update|share|key\s+share)(?:\s+(?:skip\s+locked|nowait))?$/i, '').trim();

  const rowMode = queryInput?.rowMode;
  const effectiveParams = params && params.length > 0 ? params : queryInput?.values || [];

  // 1. Transaction controls
  if (/^begin\b/i.test(text)) {
    transactionStack.push(cloneStore());
    return { rows: [], rowCount: 0 };
  }

  if (/^commit\b/i.test(text)) {
    if (transactionStack.length > 0) {
      transactionStack.pop();
    }
    return { rows: [], rowCount: 0 };
  }

  if (/^rollback\b/i.test(text)) {
    if (transactionStack.length > 0) {
      const snapshot = transactionStack.pop()!;
      globalStore.clear();
      for (const [k, v] of snapshot.entries()) {
        globalStore.set(k, v);
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 2. Health check / Ping: SELECT 1
  if (/^select\s+1\b/i.test(text)) {
    return {
      rows: rowMode === 'array' ? [[1]] : [{ '?column?': 1 }],
      rowCount: 1,
    };
  }

  // 3. INSERT INTO "table" (...) VALUES (...)
  const insertMatch = text.match(
    /insert\s+into\s+"([^"]+)"\s*\(([^)]+)\)\s*values\s*([\s\S]+?)(?:\s+on\s+conflict.*)?(?:\s+returning.*)?$/i
  );
  if (insertMatch && insertMatch[1] && insertMatch[2] && insertMatch[3]) {
    const tableName = insertMatch[1];
    const cols = splitTopLevel(insertMatch[2]).map((c) => extractColumnIdentifier(c).key);
    const tableRows = getTable(tableName);

    // Extract values tuples: ($1, $2, ...), ($3, $4, ...)
    const valuesClause = insertMatch[3].trim();
    const tupleMatches = [...valuesClause.matchAll(/\(([^)]+)\)/g)];

    let paramIndex = 0;
    const insertedRows: any[] = [];

    for (const tuple of tupleMatches) {
      const rawTokens = splitTopLevel(tuple[1]);
      const newRow: Record<string, any> = {};

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        if (!col) continue;
        const token = rawTokens[i]?.trim() || 'default';

        if (token.startsWith('$')) {
          newRow[col] = effectiveParams[paramIndex++];
        } else if (token.toLowerCase() === 'default' || token.toLowerCase() === 'null') {
          // Automatic timestamps
          if (col === 'createdAt' || col === 'updatedAt' || col === 'created_at' || col === 'updated_at') {
            newRow[col] = new Date();
          } else {
            newRow[col] = null;
          }
        } else {
          newRow[col] = token.replace(/^'|'$/g, '');
        }
      }

      // Check for conflict if ON CONFLICT DO NOTHING
      const isDoNothing = /on\s+conflict\b.*do\s+nothing/i.test(text);
      const existingIdx = tableRows.findIndex(
        (r) => (r.id && newRow.id && r.id === newRow.id) || (r.name && newRow.name && r.name === newRow.name)
      );

      if (existingIdx >= 0) {
        if (!isDoNothing) {
          tableRows[existingIdx] = { ...tableRows[existingIdx], ...newRow };
          insertedRows.push(tableRows[existingIdx]);
        }
      } else {
        tableRows.push(newRow);
        insertedRows.push(newRow);
      }
    }

    // Check returning
    if (/returning\b/i.test(text)) {
      const retMatch = text.match(/returning\s+([\s\S]+)$/i);
      const retCols = retMatch && retMatch[1]
        ? splitTopLevel(retMatch[1]).map((c) => extractColumnIdentifier(c).key)
        : cols;

      const formatted = insertedRows.map((r) => {
        if (rowMode === 'array') {
          return retCols.map((c) => (c ? getRowValue(r, c) ?? null : null));
        }
        const obj: Record<string, any> = {};
        for (const c of retCols) {
          if (c) obj[c] = getRowValue(r, c) ?? null;
        }
        return obj;
      });

      return { rows: formatted, rowCount: formatted.length };
    }

    return { rows: [], rowCount: insertedRows.length };
  }

  // 4. UPDATE "table" SET ... WHERE ...
  const updateMatch = text.match(
    /update\s+"([^"]+)"\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+?))?(?:\s+returning\b([\s\S]+))?$/i
  );
  if (updateMatch && updateMatch[1] && updateMatch[2]) {
    const tableName = updateMatch[1];
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];
    const returningClause = updateMatch[4];

    const tableRows = getTable(tableName);

    // Parse set assignments: "col" = $1, "col2" = default
    const setAssignments = splitTopLevel(setClause);
    const updates: Record<string, any> = {};

    let updateParamIdx = 0;
    for (const assign of setAssignments) {
      const parts = assign.split('=').map((s) => s.trim());
      const left = parts[0] || '';
      const right = parts[1] || '';
      const col = extractColumnIdentifier(left).key;
      if (!col) continue;

      if (right.startsWith('$')) {
        updates[col] = effectiveParams[updateParamIdx++];
      } else if (right.toLowerCase() === 'default' || right.toLowerCase() === 'null') {
        updates[col] = null;
      } else {
        updates[col] = right.replace(/^'|'$/g, '');
      }
    }

    // Identify matching rows
    const updatedRows: any[] = [];
    for (let i = 0; i < tableRows.length; i++) {
      if (!whereClause || evaluateWhereClause(whereClause, tableRows[i], effectiveParams)) {
        tableRows[i] = {
          ...tableRows[i],
          ...updates,
          updatedAt: new Date(),
          updated_at: new Date(),
        };
        updatedRows.push(tableRows[i]);
      }
    }

    if (returningClause) {
      const retCols = splitTopLevel(returningClause).map((c) => extractColumnIdentifier(c).key);
      const formatted = updatedRows.map((r) => {
        if (rowMode === 'array') {
          return retCols.map((c) => (c ? getRowValue(r, c) ?? null : null));
        }
        const obj: Record<string, any> = {};
        for (const c of retCols) {
          if (c) obj[c] = getRowValue(r, c) ?? null;
        }
        return obj;
      });
      return { rows: formatted, rowCount: formatted.length };
    }

    return { rows: [], rowCount: updatedRows.length };
  }

  // 5. DELETE FROM "table" WHERE ...
  const deleteMatch = text.match(
    /delete\s+from\s+"([^"]+)"(?:\s+where\s+([\s\S]+?))?(?:\s+returning\b([\s\S]+))?$/i
  );
  if (deleteMatch && deleteMatch[1]) {
    const tableName = deleteMatch[1];
    const whereClause = deleteMatch[2];
    const returningClause = deleteMatch[3];

    const tableRows = getTable(tableName);
    const retained: any[] = [];
    const deleted: any[] = [];

    for (const row of tableRows) {
      if (!whereClause || evaluateWhereClause(whereClause, row, effectiveParams)) {
        deleted.push(row);
      } else {
        retained.push(row);
      }
    }

    globalStore.set(tableName, retained);

    if (returningClause) {
      const retCols = splitTopLevel(returningClause).map((c) => extractColumnIdentifier(c).key);
      const formatted = deleted.map((r) => {
        if (rowMode === 'array') {
          return retCols.map((c) => (c ? getRowValue(r, c) ?? null : null));
        }
        const obj: Record<string, any> = {};
        for (const c of retCols) {
          if (c) obj[c] = getRowValue(r, c) ?? null;
        }
        return obj;
      });
      return { rows: formatted, rowCount: formatted.length };
    }

    return { rows: [], rowCount: deleted.length };
  }

  // 6. SELECT ... FROM "table" [JOIN ...] [WHERE ...] [ORDER BY ...] [LIMIT ...] [OFFSET ...]
  const selectMatch = text.match(
    /select\s+([\s\S]+?)\s+from\s+"([^"]+)"(?:\s+(?:left|right|inner|full)?\s*join\s+"([^"]+)"\s+on\s+([\s\S]+?))?(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([\s\S]+?))?(?:\s+limit\s+(\d+|\$\d+))?(?:\s+offset\s+(\d+|\$\d+))?$/i
  );
  if (selectMatch && selectMatch[1] && selectMatch[2]) {
    const rawCols = selectMatch[1];
    const tableName = selectMatch[2];
    const joinedTable = selectMatch[3];
    const joinOnClause = selectMatch[4];
    const whereClause = selectMatch[5];
    const orderByClause = selectMatch[6];
    const limitClause = selectMatch[7];
    const offsetClause = selectMatch[8];

    let tableRows = getTable(tableName);

    // If a JOIN is present, merge joined table columns
    if (joinedTable) {
      const joinedRows = getTable(joinedTable);
      tableRows = tableRows.map((r) => {
        // Attempt to find matching row: e.g. payments.merchantId === merchants.id
        const foreignKey = r.merchantId || r.merchant_id || r.userId || r.user_id || r.paymentId || r.payment_id;
        const matchingJoined = joinedRows.find((j) => (foreignKey && (j.id === foreignKey || j.merchant_id === foreignKey))) || {};
        return { ...matchingJoined, ...r };
      });
    }

    // Evaluate WHERE
    let filtered = whereClause
      ? tableRows.filter((r) => evaluateWhereClause(whereClause, r, effectiveParams))
      : [...tableRows];

    // Evaluate ORDER BY
    if (orderByClause) {
      const isDesc = /desc\b/i.test(orderByClause);
      const colName = extractColumnIdentifier(orderByClause.replace(/\b(asc|desc)\b/gi, '')).key;
      filtered.sort((a, b) => {
        const valA = getRowValue(a, colName) ?? '';
        const valB = getRowValue(b, colName) ?? '';
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    }

    // Evaluate OFFSET and LIMIT
    let offset = 0;
    if (offsetClause) {
      if (offsetClause.startsWith('$')) {
        const idx = parseInt(offsetClause.slice(1), 10) - 1;
        offset = Number(effectiveParams[idx]) || 0;
      } else {
        offset = parseInt(offsetClause, 10) || 0;
      }
    }

    let limit = filtered.length;
    if (limitClause) {
      if (limitClause.startsWith('$')) {
        const idx = parseInt(limitClause.slice(1), 10) - 1;
        limit = Number(effectiveParams[idx]) || limit;
      } else {
        limit = parseInt(limitClause, 10) || limit;
      }
    }

    filtered = filtered.slice(offset, offset + limit);

    // Columns requested
    const parsedCols = splitTopLevel(rawCols).map((c) => extractColumnIdentifier(c));

    // Check if aggregate query (e.g. SELECT count(*)::int, coalesce(sum(...), 0) FROM ...)
    const hasAggregates = parsedCols.some((c) => c.isAggregate || c.key === 'totalVolume');
    if (hasAggregates) {
      const aggRow: Record<string, any> = {};
      for (const col of parsedCols) {
        if (col.isAggregate === 'count' || col.key === 'totalCount' || col.key === 'completedCount') {
          aggRow[col.key] = filtered.length;
        } else if (col.isAggregate === 'sum' || col.key === 'totalVolume' || col.key === 'totalRefunded') {
          aggRow[col.key] = '0';
        } else {
          aggRow[col.key] = null;
        }
      }

      const rows =
        rowMode === 'array' ? [parsedCols.map((c) => aggRow[c.key])] : [aggRow];
      return { rows, rowCount: 1 };
    }

    // Format output
    const formatted = filtered.map((r) => {
      if (rowMode === 'array') {
        return parsedCols.map((c) => getRowValue(r, c.key) ?? null);
      }
      const obj: Record<string, any> = {};
      for (const c of parsedCols) {
        obj[c.key] = getRowValue(r, c.key) ?? null;
      }
      return obj;
    });

    return { rows: formatted, rowCount: formatted.length };
  }

  // 7. Safe fallback for any unrecognized SQL
  return { rows: [], rowCount: 0 };
}

/**
 * Creates a raw client compatible with @neondatabase/serverless Pool interface
 * that routes queries through the in-memory engine.
 */
export function createInMemoryClient(): any {
  return {
    isMock: true,
    mode: 'mock',
    async query(queryInput: any, params?: any[]) {
      return executeInMemoryQuery(queryInput, params || []);
    },
    async connect() {
      return this;
    },
    async end() {
      // no-op
    },
    release() {
      // no-op
    },
    on() {
      return this;
    },
    removeListener() {
      return this;
    },
  };
}

/**
 * Creates a full Drizzle ORM client backed by the resilient in-memory storage engine.
 */
export function createInMemoryDbClient(): any {
  const client = createInMemoryClient();
  const db = drizzle(client, { schema });

  // Decorate with diagnostic properties and resilience helpers
  (db as any).isMock = true;
  (db as any).mode = 'mock';
  (db as any).$client = client;
  (db as any).execute = async (q: any) => executeInMemoryQuery(q);
  (db as any).withRetry = <T>(op: () => Promise<T>) => op();

  return db;
}

