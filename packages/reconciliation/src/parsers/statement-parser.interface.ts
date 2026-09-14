import type { StatementBatch, StatementItem } from '../types.js';

export interface StatementParser {
  readonly provider: string;
  parse(content: string, batchReference?: string): Promise<StatementBatch>;
}

export type { StatementBatch, StatementItem };
