-- ==============================================================================
-- DENANEYA PL/pgSQL TRIGGERS, FUNCTIONS, AND DEFERRED CONSTRAINTS
-- ==============================================================================

-- 1. Double-Entry Balance Verification Function
CREATE OR REPLACE FUNCTION verify_ledger_transaction_balanced()
RETURNS TRIGGER AS $$
DECLARE
  v_balance BIGINT;
  v_debit_count INT;
  v_credit_count INT;
BEGIN
  -- Sum all DEBITs (+amount) and CREDITs (-amount) for the transaction
  SELECT 
    COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_paisa ELSE -amount_paisa END), 0),
    COUNT(CASE WHEN direction = 'DEBIT' THEN 1 END),
    COUNT(CASE WHEN direction = 'CREDIT' THEN 1 END)
  INTO v_balance, v_debit_count, v_credit_count
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  -- Require at least one debit and one credit
  IF v_debit_count = 0 OR v_credit_count = 0 THEN
    RAISE EXCEPTION 'Ledger transaction % is invalid: requires at least one DEBIT and one CREDIT posting',
      NEW.transaction_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify Net Sum == 0 (Debits == Credits)
  IF v_balance <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % is unbalanced: net difference is % paisa (SUM(Debits) != SUM(Credits))',
      NEW.transaction_id, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Deferred Constraint Trigger on ledger_entries
DROP TRIGGER IF EXISTS trg_verify_ledger_balance ON ledger_entries;
CREATE CONSTRAINT TRIGGER trg_verify_ledger_balance
AFTER INSERT OR UPDATE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_ledger_transaction_balanced();

-- 3. Forbid Ledger Mutation Function (Append-Only Financial Guarantee)
CREATE OR REPLACE FUNCTION forbid_ledger_modifications()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Financial Ledger is immutable: UPDATE and DELETE operations are prohibited on %', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Compatible synonym: prevent_ledger_modification()
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Financial Ledger is immutable: UPDATE and DELETE operations are prohibited on %', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Prevent UPDATE or DELETE on ledger transactions
DROP TRIGGER IF EXISTS trg_immutable_ledger_transactions ON ledger_transactions;
CREATE TRIGGER trg_immutable_ledger_transactions
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- Prevent UPDATE or DELETE on ledger entries
DROP TRIGGER IF EXISTS trg_immutable_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_immutable_ledger_entries
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- 4. Forbid Audit Log Modifications (Cryptographic Hash-Chaining Protection)
CREATE OR REPLACE FUNCTION forbid_audit_log_modifications()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable: UPDATE and DELETE are prohibited on %', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_modifications();

-- 5. Payment State Machine Transition Guard
CREATE OR REPLACE FUNCTION enforce_payment_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid BOOLEAN := FALSE;
BEGIN
  -- If status did not change, permit update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Evaluate strict 11-state transition matrix
  v_valid := CASE
    WHEN OLD.status = 'CREATED' AND NEW.status IN ('REQUIRES_ACTION', 'PENDING', 'PROCESSING', 'CANCELLED', 'EXPIRED', 'FAILED') THEN TRUE
    WHEN OLD.status = 'REQUIRES_ACTION' AND NEW.status IN ('PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'EXPIRED') THEN TRUE
    WHEN OLD.status = 'PENDING' AND NEW.status IN ('PROCESSING', 'UNDER_REVIEW', 'FAILED', 'CANCELLED', 'EXPIRED') THEN TRUE
    WHEN OLD.status = 'PROCESSING' AND NEW.status IN ('UNDER_REVIEW', 'COMPLETED', 'FAILED') THEN TRUE
    WHEN OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN TRUE
    WHEN OLD.status = 'COMPLETED' AND NEW.status IN ('PARTIALLY_REFUNDED', 'REFUNDED') THEN TRUE
    WHEN OLD.status = 'PARTIALLY_REFUNDED' AND NEW.status IN ('PARTIALLY_REFUNDED', 'REFUNDED') THEN TRUE
    ELSE FALSE
  END;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Illegal payment state transition from % to % for payment %',
      OLD.status, NEW.status, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bump version automatically for optimistic concurrency control
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_payment_transition ON payments;
CREATE TRIGGER trg_enforce_payment_transition
BEFORE UPDATE OF status ON payments
FOR EACH ROW EXECUTE FUNCTION enforce_payment_state_transition();
