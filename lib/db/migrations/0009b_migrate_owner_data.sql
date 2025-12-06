-- Migration Part 2: Migrate owner_id to permissions and drop column
-- Run this AFTER 0009a has been committed

-- Step 1: Migrate ownerIds to user_permissions with 'owner' permission
INSERT INTO user_permissions (user_id, folder_id, permission)
SELECT owner_id, root_folder_id, 'owner'::perm_type
FROM fs_roots
WHERE owner_id IS NOT NULL
ON CONFLICT (user_id, folder_id) 
DO UPDATE SET permission = 'owner'::perm_type;

-- Step 2: Drop the old index that references owner_id
DROP INDEX IF EXISTS fs_roots_owner_type_idx;

-- Step 3: Drop the foreign key constraint on owner_id
ALTER TABLE fs_roots DROP CONSTRAINT IF EXISTS fs_roots_owner_id_User_id_fk;

-- Step 4: Drop the owner_id column
ALTER TABLE fs_roots DROP COLUMN IF EXISTS owner_id;

-- Step 5: Create new index on type only
CREATE INDEX IF NOT EXISTS fs_roots_type_idx ON fs_roots USING btree (type);
