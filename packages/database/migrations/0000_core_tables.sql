-- ==============================================================================
-- 0000_core_tables.sql - DenaNeya Core PostgreSQL Schema DDL
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE merchant_business_type AS ENUM ('INDIVIDUAL', 'SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE merchant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE merchant_role AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE api_key_type AS ENUM ('SECRET', 'PUBLISHABLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE environment AS ENUM ('SANDBOX', 'PRODUCTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('CREATED', 'REQUIRES_ACTION', 'PENDING', 'PROCESSING', 'UNDER_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_link_type AS ENUM ('SINGLE_USE', 'MULTI_USE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_link_status AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE verification_tier AS ENUM ('TIER_A', 'TIER_B', 'TIER_C', 'TIER_D');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE normal_balance AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_tx_type AS ENUM ('PAYMENT_CAPTURE', 'GATEWAY_FEE', 'MERCHANT_PAYOUT', 'REFUND', 'DISPUTE_REVERSAL', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE mfs_provider AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'UPAY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE sms_status AS ENUM ('PENDING', 'PARSED', 'MATCHED', 'PARSER_UNRECOGNIZED', 'DUPLICATE', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE device_status AS ENUM ('PENDING_PAIRING', 'ACTIVE', 'OFFLINE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE collector_event_type AS ENUM ('SMS_RECEIVED', 'HEARTBEAT', 'STATUS_UPDATE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE collector_event_status AS ENUM ('PROCESSED', 'REJECTED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE webhook_subscription_status AS ENUM ('ACTIVE', 'DISABLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE webhook_delivery_status AS ENUM ('SUCCESS', 'RETRYING', 'DEAD_LETTER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE outbox_status AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_classification AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_action AS ENUM ('ALLOW', 'CHALLENGE', 'UNDER_REVIEW', 'BLOCK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE review_case_status AS ENUM ('OPEN', 'MAKER_RECOMMENDED', 'CHECKER_APPROVED', 'CHECKER_REJECTED', 'AUTO_RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM ('APPROVE', 'REJECT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE audit_actor_type AS ENUM ('USER', 'API_KEY', 'DEVICE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Create Tables

-- Merchants
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_type merchant_business_type NOT NULL DEFAULT 'INDIVIDUAL',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  website_url TEXT,
  logo_url TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'PENDING',
  status merchant_status NOT NULL DEFAULT 'ACTIVE',
  default_currency TEXT NOT NULL DEFAULT 'BDT',
  environment environment NOT NULL DEFAULT 'SANDBOX',
  fee_rate_bps INTEGER NOT NULL DEFAULT 150,
  fixed_fee_paisa BIGINT NOT NULL DEFAULT 0,
  settlement_bank_name TEXT,
  settlement_bank_account_number TEXT,
  settlement_routing_number TEXT,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants (email);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants (status);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  email_verified TIMESTAMPTZ,
  image TEXT,
  mfa_secret TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Merchant Memberships
CREATE TABLE IF NOT EXISTS merchant_memberships (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role merchant_role NOT NULL DEFAULT 'VIEWER',
  status membership_status NOT NULL DEFAULT 'ACTIVE',
  invited_email TEXT,
  invitation_token TEXT,
  invitation_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_user_membership ON merchant_memberships (merchant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON merchant_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_merchant_id ON merchant_memberships (merchant_id);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  type api_key_type NOT NULL DEFAULT 'SECRET',
  environment environment NOT NULL DEFAULT 'SANDBOX',
  scopes JSONB NOT NULL DEFAULT '["payments:read","payments:write"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_lookup ON api_keys (key_prefix, environment);
CREATE INDEX IF NOT EXISTS idx_api_keys_merchant_id ON api_keys (merchant_id);

-- Accounts (Auth.js)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider_provider_account_id ON accounts (provider, provider_account_id);

-- Sessions (Auth.js)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

-- Verification Tokens (Auth.js)
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_tokens_identifier_token ON verification_tokens (identifier, token);

-- Payment Links
CREATE TABLE IF NOT EXISTS payment_links (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  amount_paisa BIGINT,
  currency TEXT NOT NULL DEFAULT 'BDT',
  type payment_link_type NOT NULL DEFAULT 'SINGLE_USE',
  status payment_link_status NOT NULL DEFAULT 'ACTIVE',
  allowed_providers JSONB DEFAULT '["BKASH","NAGAD","ROCKET","SSLCOMMERZ"]'::jsonb,
  redirect_url TEXT,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links (merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_slug ON payment_links (slug);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_address JSONB,
  subtotal_paisa BIGINT NOT NULL,
  tax_paisa BIGINT NOT NULL DEFAULT 0,
  discount_paisa BIGINT NOT NULL DEFAULT 0,
  total_amount_paisa BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_id TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invoice_amounts CHECK (total_amount_paisa >= 0 AND subtotal_paisa >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_merchant_number ON invoices (merchant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant_status ON invoices (merchant_id, status);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_paisa BIGINT NOT NULL,
  tax_rate_bps INTEGER NOT NULL DEFAULT 0,
  total_paisa BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invoice_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_invoice_item_price CHECK (unit_price_paisa >= 0)
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  amount_paisa BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  status payment_status NOT NULL DEFAULT 'CREATED',
  fee_paisa BIGINT NOT NULL DEFAULT 0,
  refunded_amount_paisa BIGINT NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  billing_address JSONB,
  provider TEXT,
  provider_trx_id TEXT,
  provider_session_id TEXT,
  provider_metadata JSONB,
  idempotency_key TEXT,
  payment_link_id TEXT REFERENCES payment_links(id),
  invoice_id TEXT REFERENCES invoices(id),
  description TEXT,
  metadata JSONB,
  settled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  verified_tier verification_tier,
  risk_score INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payment_amount_positive CHECK (amount_paisa > 0),
  CONSTRAINT chk_payment_refund_bounds CHECK (refunded_amount_paisa >= 0 AND refunded_amount_paisa <= amount_paisa),
  CONSTRAINT chk_payment_currency_bdt CHECK (currency = 'BDT')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_merchant_idempotency ON payments (merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_trx_unique ON payments (provider, provider_trx_id) WHERE provider_trx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_merchant_status ON payments (merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at);
CREATE INDEX IF NOT EXISTS idx_payments_customer_phone ON payments (customer_phone);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  amount_paisa BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  status refund_status NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL,
  provider_refund_id TEXT,
  provider_metadata JSONB,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_refund_amount_positive CHECK (amount_paisa > 0),
  CONSTRAINT chk_refund_currency_bdt CHECK (currency = 'BDT')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency ON refunds (merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_merchant_id ON refunds (merchant_id);

-- Ledger Accounts
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  normal_balance normal_balance NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_code_merchant ON ledger_accounts (code, merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_merchant ON ledger_accounts (merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_type ON ledger_accounts (type);

-- Ledger Transactions
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE RESTRICT,
  transaction_type ledger_tx_type NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  description TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_reference ON ledger_transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_merchant ON ledger_transactions (merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_posted_at ON ledger_transactions (posted_at);

-- Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  direction entry_direction NOT NULL,
  amount_paisa BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_entry_amount_positive CHECK (amount_paisa > 0),
  CONSTRAINT chk_ledger_entry_currency_bdt CHECK (currency = 'BDT')
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_id);

-- Collector Devices
CREATE TABLE IF NOT EXISTS collector_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  model TEXT,
  os_version TEXT,
  app_version TEXT,
  public_key_hex TEXT NOT NULL,
  sequence_number BIGINT NOT NULL DEFAULT 0,
  sim_slots JSONB,
  assigned_wallets JSONB,
  battery_level INTEGER,
  is_charging BOOLEAN,
  network_type TEXT,
  status device_status NOT NULL DEFAULT 'PENDING_PAIRING',
  pairing_token_hash TEXT,
  pairing_token_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collector_devices_merchant ON collector_devices (merchant_id);
CREATE INDEX IF NOT EXISTS idx_collector_devices_status ON collector_devices (status);

-- Collector Events
CREATE TABLE IF NOT EXISTS collector_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES collector_devices(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sequence_number BIGINT NOT NULL,
  nonce TEXT NOT NULL,
  event_type collector_event_type NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  status collector_event_status NOT NULL DEFAULT 'PROCESSED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collector_events_device_sequence ON collector_events (device_id, sequence_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collector_events_device_nonce ON collector_events (device_id, nonce);
CREATE INDEX IF NOT EXISTS idx_collector_events_device ON collector_events (device_id);

-- SMS Messages
CREATE TABLE IF NOT EXISTS sms_messages (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES collector_devices(id) ON DELETE SET NULL,
  provider mfs_provider NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  amount_paisa BIGINT,
  trx_id TEXT,
  counterparty_msisdn TEXT,
  rolling_balance_paisa BIGINT,
  fee_paisa BIGINT DEFAULT 0,
  hash TEXT NOT NULL UNIQUE,
  parser_version TEXT NOT NULL DEFAULT 'v1',
  sim_slot INTEGER DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL,
  status sms_status NOT NULL DEFAULT 'PENDING',
  is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_by_payment_id TEXT REFERENCES payments(id),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_hash ON sms_messages (hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_single_consumption ON sms_messages (consumed_by_payment_id) WHERE consumed_by_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_trx_id ON sms_messages (trx_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_merchant_status ON sms_messages (merchant_id, status);

-- Webhook Subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '["payment.completed","refund.created"]'::jsonb,
  status webhook_subscription_status NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_merchant ON webhook_subscriptions (merchant_id);

-- Webhook Deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  request_headers JSONB,
  response_status INTEGER,
  response_body TEXT,
  response_headers JSONB,
  duration_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  status webhook_delivery_status NOT NULL,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries (subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);

-- Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON outbox_events (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_merchant ON outbox_events (merchant_id);

-- Fraud Evaluations
CREATE TABLE IF NOT EXISTS fraud_evaluations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL,
  classification risk_classification NOT NULL,
  action_taken risk_action NOT NULL,
  triggered_rules JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fraud_risk_score_bounds CHECK (risk_score >= 0 AND risk_score <= 100)
);
CREATE INDEX IF NOT EXISTS idx_fraud_eval_payment ON fraud_evaluations (payment_id);
CREATE INDEX IF NOT EXISTS idx_fraud_eval_merchant_score ON fraud_evaluations (merchant_id, risk_score);

-- Review Cases
CREATE TABLE IF NOT EXISTS review_cases (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  status review_case_status NOT NULL DEFAULT 'OPEN',
  reason TEXT NOT NULL,
  maker_id TEXT REFERENCES users(id),
  maker_recommendation review_decision,
  maker_notes TEXT,
  maker_decided_at TIMESTAMPTZ,
  checker_id TEXT REFERENCES users(id),
  checker_decision review_decision,
  checker_notes TEXT,
  checker_decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_maker_checker_distinct CHECK (maker_id IS NULL OR checker_id IS NULL OR maker_id <> checker_id)
);
CREATE INDEX IF NOT EXISTS idx_review_cases_status ON review_cases (status);
CREATE INDEX IF NOT EXISTS idx_review_cases_payment ON review_cases (payment_id);
CREATE INDEX IF NOT EXISTS idx_review_cases_merchant ON review_cases (merchant_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL,
  actor_type audit_actor_type NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  payload JSONB,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_merchant_action ON audit_logs (merchant_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);
