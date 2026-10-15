-- Run this once against the existing student_housing_agent_settings table.
-- Nullable columns keep older installations readable; application defaults
-- fill empty settings until the admin saves the new sections.
ALTER TABLE student_housing_agent_settings
  ADD COLUMN IF NOT EXISTS conversation_behavior text,
  ADD COLUMN IF NOT EXISTS guardrails text,
  ADD COLUMN IF NOT EXISTS handover_rules text,
  ADD COLUMN IF NOT EXISTS knowledge_rules text,
  ADD COLUMN IF NOT EXISTS cta_settings text,
  ADD COLUMN IF NOT EXISTS feedback_settings text;

ALTER TABLE student_housing_agent_settings
  ADD COLUMN IF NOT EXISTS integrations jsonb;
