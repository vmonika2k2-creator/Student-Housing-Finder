-- Give the student-facing agent a separately editable conversation environment.
-- Keep the column nullable so existing installations receive the app default.
ALTER TABLE student_housing_agent_settings
  ADD COLUMN IF NOT EXISTS environment text;
