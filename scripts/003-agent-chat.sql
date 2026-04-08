-- 003-agent-chat.sql
-- Chat messages between users and their agents (Concierge tier)

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  agent_id uuid NOT NULL REFERENCES agent_agents(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  is_eval_preview boolean DEFAULT false,
  tokens_used int,
  cost_usdc numeric(12,6),
  session_id uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_agent_time ON agent_chat_messages(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_session ON agent_chat_messages(session_id, created_at);
