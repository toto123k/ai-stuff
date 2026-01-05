-- Add metadata JSONB column to fs_objects for storing spreadsheet schema and future metadata
ALTER TABLE fs_objects ADD COLUMN metadata JSONB;
