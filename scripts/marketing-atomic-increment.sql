-- Atomic increment for marketing agent stats
-- Prevents read-modify-write race conditions on concurrent conversions
-- Run once via Supabase SQL Editor

CREATE OR REPLACE FUNCTION increment_marketing_agent_stats(
  agent_id UUID,
  conversion_count INTEGER DEFAULT 1,
  commission_amount NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mkt_agents
  SET
    total_conversions = total_conversions + conversion_count,
    total_commission_usdc = total_commission_usdc + commission_amount,
    updated_at = NOW()
  WHERE id = agent_id;
END;
$$;
