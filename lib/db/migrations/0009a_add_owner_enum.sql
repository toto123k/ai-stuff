-- Migration Part 1: Add 'owner' to perm_type enum
-- Run this FIRST and COMMIT before running part 2

DO $$ BEGIN
  ALTER TYPE perm_type ADD VALUE IF NOT EXISTS 'owner' AFTER 'admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
