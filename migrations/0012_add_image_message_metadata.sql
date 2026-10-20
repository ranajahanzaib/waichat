ALTER TABLE conversations ADD COLUMN image_model TEXT;
ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN image_metadata TEXT;
