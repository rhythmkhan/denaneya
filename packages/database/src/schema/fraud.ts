import { pgTable, text, timestamp, integer, jsonb, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { merchants, users } from './auth.js';
import { payments } from './payments.js';
import {
  riskClassificationEnum,
  riskActionEnum,
  reviewCaseStatusEnum,
  reviewDecisionEnum,
} from './enums.js';

// 1. FRAUD EVALUATIONS (Per-payment risk scoring snapshot)
export const fraudEvaluations = pgTable('fraud_evaluations', {
  id: text('id').primaryKey(), // 'frd_' + nanoid(16)
  paymentId: text('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  riskScore: integer('risk_score').notNull(), // 0 to 100
  classification: riskClassificationEnum('classification').notNull(),
  actionTaken: riskActionEnum('action_taken').notNull(),
  triggeredRules: jsonb('triggered_rules').$type<Array<{
    ruleId: string;
    weight: number;
    description: string;
    metadata?: Record<string, unknown>;
  }>>().notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_fraud_eval_payment').on(table.paymentId),
  index('idx_fraud_eval_merchant_score').on(table.merchantId, table.riskScore),
  check('chk_fraud_risk_score_bounds', sql`risk_score >= 0 AND risk_score <= 100`),
]);

// 2. REVIEW CASES (Maker-Checker Queue)
export const reviewCases = pgTable('review_cases', {
  id: text('id').primaryKey(), // 'rcs_' + nanoid(16)
  paymentId: text('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  merchantId: text('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  status: reviewCaseStatusEnum('status').notNull().default('OPEN'),
  reason: text('reason').notNull(),
  makerId: text('maker_id').references(() => users.id),
  makerRecommendation: reviewDecisionEnum('maker_recommendation'),
  makerNotes: text('maker_notes'),
  makerDecidedAt: timestamp('maker_decided_at', { withTimezone: true }),
  checkerId: text('checker_id').references(() => users.id),
  checkerDecision: reviewDecisionEnum('checker_decision'),
  checkerNotes: text('checker_notes'),
  checkerDecidedAt: timestamp('checker_decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_review_cases_status').on(table.status),
  index('idx_review_cases_payment').on(table.paymentId),
  index('idx_review_cases_merchant').on(table.merchantId),
  // Strict Maker-Checker Separation of Duties: maker cannot be checker!
  check('chk_maker_checker_distinct', sql`maker_id IS NULL OR checker_id IS NULL OR maker_id <> checker_id`),
]);

// Relations
export const fraudEvaluationsRelations = relations(fraudEvaluations, ({ one }) => ({
  payment: one(payments, {
    fields: [fraudEvaluations.paymentId],
    references: [payments.id],
  }),
  merchant: one(merchants, {
    fields: [fraudEvaluations.merchantId],
    references: [merchants.id],
  }),
}));

export const reviewCasesRelations = relations(reviewCases, ({ one }) => ({
  payment: one(payments, {
    fields: [reviewCases.paymentId],
    references: [payments.id],
  }),
  merchant: one(merchants, {
    fields: [reviewCases.merchantId],
    references: [merchants.id],
  }),
  maker: one(users, {
    fields: [reviewCases.makerId],
    references: [users.id],
  }),
  checker: one(users, {
    fields: [reviewCases.checkerId],
    references: [users.id],
  }),
}));
