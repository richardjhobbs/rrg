-- 002-agent-persona.sql
-- Add persona, interest categories, and avatar fields to agent_agents

ALTER TABLE agent_agents
  ADD COLUMN IF NOT EXISTS persona_bio text,
  ADD COLUMN IF NOT EXISTS persona_voice text,
  ADD COLUMN IF NOT EXISTS persona_comm_style text,
  ADD COLUMN IF NOT EXISTS interest_categories jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_source text DEFAULT 'none' CHECK (avatar_source IN ('none','preset','uploaded','generated'));
