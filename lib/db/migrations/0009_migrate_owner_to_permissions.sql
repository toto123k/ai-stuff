-- Migration: Move ownerId from fs_roots to user_permissions
-- This migration does the following:
-- 1. Adds 'owner' to the perm_type enum
-- 2. Migrates all existing ownerIds to user_permissions with 'owner' permission
-- 3. Drops the ownerId column and its foreign key from fs_roots
-- 4. Updates index

-- Step 1: Add 'owner' to perm_type enum (if not exists)
DO $$ BEGIN
  ALTER TYPE perm_type ADD VALUE IF NOT EXISTS 'owner' AFTER 'admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Migrate ownerIds to user_permissions with 'owner' permission
-- This uses INSERT ... ON CONFLICT to handle any existing permissions
INSERT INTO user_permissions (user_id, folder_id, permission)
SELECT owner_id, root_folder_id, 'owner'::perm_type
FROM fs_roots
WHERE owner_id IS NOT NULL
ON CONFLICT (user_id, folder_id) 
DO UPDATE SET permission = 'owner'::perm_type;

-- Step 3: Drop the old index that references owner_id
DROP INDEX IF EXISTS fs_roots_owner_type_idx;

-- Step 4: Drop the foreign key constraint on owner_id
ALTER TABLE fs_roots DROP CONSTRAINT IF EXISTS fs_roots_owner_id_User_id_fk;

-- Step 5: Drop the owner_id column
ALTER TABLE fs_roots DROP COLUMN IF EXISTS owner_id;

-- Step 6: Create new index on type only
CREATE INDEX IF NOT EXISTS fs_roots_type_idx ON fs_roots USING btree (type);
