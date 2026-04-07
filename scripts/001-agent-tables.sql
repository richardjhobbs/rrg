-- VIA Agent Drop System — Phase 1 tables
-- Run against the shared Supabase instance (sanvqnvvzdkjvfmxnxur)

-- ── Agent core record ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'basic'
    CHECK (tier IN ('basic', 'pro')),

  -- Preferences
  style_tags text[] NOT NULL DEFAULT '{}',
  free_instructions text,
  parsed_rules jsonb NOT NULL DEFAULT '{}',
  budget_ceiling_usdc numeric(12,2),
  bid_aggression text NOT NULL DEFAULT 'balanced'
    CHECK (bid_aggression IN ('conservative', 'balanced', 'aggressive')),

  -- Wallet
  wallet_address text UNIQUE NOT NULL,
  wallet_type text NOT NULL
    CHECK (wallet_type IN ('embedded', 'imported')),

  -- Pro tier LLM
  llm_provider text NOT NULL DEFAULT 'claude'
    CHECK (llm_provider IN ('claude', 'openai', 'gemini')),
  credit_balance_usdc numeric(12,4) NOT NULL DEFAULT 0,

  -- ERC-8004
  erc8004_agent_id bigint,
  erc8004_linked boolean NOT NULL DEFAULT false,

  -- Status
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  last_active_at timestamptz,
  last_poll_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_agents_email ON agent_agents(email);
CREATE INDEX IF NOT EXISTS idx_agent_agents_status ON agent_agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_agents_wallet ON agent_agents(wallet_address);

-- ── Evaluation results ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agent_id uuid NOT NULL REFERENCES agent_agents(id) ON DELETE CASCADE,
  drop_id uuid NOT NULL,
  decision text NOT NULL
    CHECK (decision IN ('skip', 'recommend', 'bid')),
  reasoning text,
  rule_match_detail jsonb,
  suggested_bid_usdc numeric(12,2),
  llm_tokens_used int,
  llm_cost_usdc numeric(12,6),
  owner_notified boolean NOT NULL DEFAULT false,
  owner_approved boolean,
  UNIQUE(agent_id, drop_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_evaluations_agent ON agent_evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_evaluations_drop ON agent_evaluations(drop_id);

-- ── Activity log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agent_id uuid NOT NULL REFERENCES agent_agents(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  tx_hash text
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created ON agent_activity_log(created_at DESC);

-- ── Credit transactions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agent_id uuid NOT NULL REFERENCES agent_agents(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('topup', 'deduction', 'refund')),
  amount_usdc numeric(12,6) NOT NULL,
  balance_after numeric(12,4) NOT NULL,
  description text,
  tx_hash text
);

CREATE INDEX IF NOT EXISTS idx_agent_credits_agent ON agent_credit_transactions(agent_id);

-- ── Updated_at trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agent_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_agents_updated ON agent_agents;
CREATE TRIGGER trg_agent_agents_updated
  BEFORE UPDATE ON agent_agents
  FOR EACH ROW
  EXECUTE FUNCTION agent_set_updated_at();
