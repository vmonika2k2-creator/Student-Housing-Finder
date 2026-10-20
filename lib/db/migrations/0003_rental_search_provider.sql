-- Persist which listing service the user-facing search uses.
-- NULL preserves the existing deployment default until an admin selects one.
ALTER TABLE student_housing_agent_settings
  ADD COLUMN IF NOT EXISTS rental_search_provider text;
