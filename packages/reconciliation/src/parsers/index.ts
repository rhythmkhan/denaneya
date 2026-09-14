import type { StatementParser } from './statement-parser.interface.js';
import { SSLCommerzStatementParser } from './sslcommerz-parser.js';
import { BKashStatementParser } from './bkash-parser.js';
import { NagadStatementParser } from './nagad-parser.js';
import { StatementParsingError } from '../errors.js';

export * from './statement-parser.interface.js';
export * from './csv-helper.js';
export * from './sslcommerz-parser.js';
export * from './bkash-parser.js';
export * from './nagad-parser.js';

export function getStatementParser(provider: string): StatementParser {
  const normalized = provider.toUpperCase().trim();
  switch (normalized) {
    case 'SSLCOMMERZ':
      return new SSLCommerzStatementParser();
    case 'BKASH':
      return new BKashStatementParser();
    case 'NAGAD':
      return new NagadStatementParser();
    default:
      throw new StatementParsingError(`Unsupported provider statement parser: ${provider}`);
  }
}
