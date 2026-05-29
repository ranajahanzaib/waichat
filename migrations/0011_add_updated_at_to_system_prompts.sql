ALTER TABLE system_prompts ADD COLUMN updated_at INTEGER;

UPDATE system_prompts SET updated_at = created_at WHERE updated_at IS NULL;
