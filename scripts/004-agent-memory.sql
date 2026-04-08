-- 004-agent-memory.sql
-- Persistent memory for agents — accumulated learnings from conversations

CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  agent_id uuid NOT NULL REFERENCES agent_agents(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('preference', 'brand', 'style', 'size', 'general', 'consolidated')),
  content text NOT NULL,
  source_session_id uuid,
  superseded_by uuid REFERENCES agent_memory(id),
  active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_memory_agent_active ON agent_memory(agent_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_memory_agent_type ON agent_memory(agent_id, type);
