import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { user, fsObjects, fsRoots, userPermissions } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Database connection
const connectionString = process.env.POSTGRES_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

// ========================================
// CONFIGURATION PARAMETERS
// ========================================
const CONFIG = {
  EXISTING_USER_UUID: '1a4fd90c-46a2-441c-ab1c-5b93f6d9d317',
  
  // User generation
  NEW_USERS_COUNT: 19,
  
  // Organizational roots
  ORGANIZATIONAL_ROOTS_COUNT: 5,
  ORGANIZATIONAL_ROOT_DEPTH: 6,
  ORGANIZATIONAL_ROOT_FILES_PER_LAYER: 10,
  
  // Personal roots
  PERSONAL_ROOT_MIN_DEPTH: 5,
  PERSONAL_ROOT_MAX_DEPTH: 6,
  PERSONAL_ROOT_MIN_FILES: 1,
  PERSONAL_ROOT_MAX_FILES: 100,
  
  // Folder structure
  SUBFOLDERS_PER_LEVEL: 3,
  
  // Permissions
  FOLDER_PERMISSION_CHANCE: 0.3, // 30% chance a folder gets permissions
  MIN_USERS_PER_FOLDER: 1,
  MAX_USERS_PER_FOLDER: 5,
  
  // Batch processing
  PERMISSION_BATCH_SIZE: 100,
} as const;

// ========================================
// UTILITY FUNCTIONS
// ========================================
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = <T,>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// ========================================
// DATABASE OPERATIONS
// ========================================
async function createUsers() {
  console.log(`Creating ${CONFIG.NEW_USERS_COUNT} new users...`);
  const users = [];
  
  for (let i = 1; i <= CONFIG.NEW_USERS_COUNT; i++) {
    users.push({
      email: `user${i}@test.com`,
      password: 'hashed_password_placeholder'
    });
  }

  const created = await db.insert(user).values(users).returning();
  console.log(`✅ Created ${created.length} users`);
  return created;
}

async function createFolderWithFiles(
  name: string,
  parentId: number | null,
  depth: number,
  maxDepth: number,
  filesPerLayer: number
): Promise<number> {
  // Create folder with temporary path
  const [folder] = await db.insert(fsObjects).values({
    name,
    type: 'folder',
    path: '0', // Temporary
  }).returning();

  // Update path: parentId ? "parentId.folderId" : "folderId"
  const folderPath = parentId ? `${parentId}.${folder.id}` : `${folder.id}`;
  await db.execute(sql`
    UPDATE fs_objects 
    SET path = ${folderPath}::ltree 
    WHERE id = ${folder.id}
  `);

  // Create files at this level
  for (let i = 1; i <= filesPerLayer; i++) {
    const [file] = await db.insert(fsObjects).values({
      name: `file_${i}.txt`,
      type: 'file',
      path: '0', // Temporary
    }).returning();
    
    const filePath = `${folderPath}.${file.id}`;
    await db.execute(sql`
      UPDATE fs_objects 
      SET path = ${filePath}::ltree 
      WHERE id = ${file.id}
    `);
  }

  // Recurse if we haven't reached max depth
  if (depth < maxDepth) {
    for (let i = 1; i <= CONFIG.SUBFOLDERS_PER_LEVEL; i++) {
      await createFolderWithFiles(
        `folder_${depth + 1}_${i}`,
        folder.id,
        depth + 1,
        maxDepth,
        filesPerLayer
      );
    }
  }

  return folder.id;
}

async function giveOwnerAdminPermission(userId: string, folderId: number) {
  await db.insert(userPermissions).values({
    userId,
    folderId,
    permission: 'admin',
  }).onConflictDoNothing();
}

async function createOrganizationalRoots(allUserIds: string[]) {
  console.log(`Creating ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} organizational root folders...`);
  
  for (let i = 1; i <= CONFIG.ORGANIZATIONAL_ROOTS_COUNT; i++) {
    console.log(`  Creating org root ${i}/${CONFIG.ORGANIZATIONAL_ROOTS_COUNT}...`);
    
    // Pick random owner from all users (including existing user)
    const randomOwner = pickRandom(allUserIds, 1)[0];
    
    const rootFolderId = await createFolderWithFiles(
      `org_root_${i}`,
      null,
      1,
      CONFIG.ORGANIZATIONAL_ROOT_DEPTH,
      CONFIG.ORGANIZATIONAL_ROOT_FILES_PER_LAYER
    );

    // Create root entry
    await db.insert(fsRoots).values({
      rootFolderId,
      ownerId: randomOwner,
      type: 'organizational',
    });

    // Give owner admin permission
    await giveOwnerAdminPermission(randomOwner, rootFolderId);
    
    console.log(`    ↳ Owner: ${randomOwner.substring(0, 8)}...`);
  }
  
  console.log(`✅ Created ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} organizational roots with depth ${CONFIG.ORGANIZATIONAL_ROOT_DEPTH}`);
}

async function createPersonalRoot(userId: string, userIndex: number) {
  const depth = random(CONFIG.PERSONAL_ROOT_MIN_DEPTH, CONFIG.PERSONAL_ROOT_MAX_DEPTH);
  const filesCount = random(CONFIG.PERSONAL_ROOT_MIN_FILES, CONFIG.PERSONAL_ROOT_MAX_FILES);
  
  console.log(`  Creating personal root for user ${userIndex} (depth: ${depth}, files: ${filesCount})...`);
  
  const rootFolderId = await createFolderWithFiles(
    `personal_${userId.substring(0, 8)}`,
    null,
    1,
    depth,
    filesCount
  );

  await db.insert(fsRoots).values({
    rootFolderId,
    ownerId: userId,
    type: 'personal',
  });

  // Give owner admin permission
  await giveOwnerAdminPermission(userId, rootFolderId);
}

async function createPersonalRoots(allUserIds: string[]) {
  console.log(`Creating personal roots for all ${allUserIds.length} users...`);
  
  for (let i = 0; i < allUserIds.length; i++) {
    await createPersonalRoot(allUserIds[i], i + 1);
  }
  
  console.log('✅ Created personal roots for all users');
}

async function addRandomPermissions(allUserIds: string[]) {
  console.log('Adding random permissions...');
  
  // Get all folders (not files)
  const allFolders = await db.select().from(fsObjects).where(eq(fsObjects.type, 'folder'));
  console.log(`  Found ${allFolders.length} folders to assign permissions to`);
  
  const permissions = [];

  // For each folder, randomly decide if it should have permissions
  for (const folder of allFolders) {
    // Skip if random chance doesn't hit
    if (Math.random() > CONFIG.FOLDER_PERMISSION_CHANCE) continue;

    // Pick random number of users
    const numUsers = random(
      CONFIG.MIN_USERS_PER_FOLDER, 
      Math.min(CONFIG.MAX_USERS_PER_FOLDER, allUserIds.length)
    );
    const selectedUsers = pickRandom(allUserIds, numUsers);

    for (const userId of selectedUsers) {
      // Random permission level
      const permTypes = ['read', 'write', 'admin'] as const;
      const permission = permTypes[random(0, 2)];

      permissions.push({
        userId,
        folderId: folder.id,
        permission,
      });
    }
  }

  console.log(`  Adding ${permissions.length} permission entries...`);
  
  // Insert in batches to avoid overwhelming the database
  for (let i = 0; i < permissions.length; i += CONFIG.PERMISSION_BATCH_SIZE) {
    const batch = permissions.slice(i, i + CONFIG.PERMISSION_BATCH_SIZE);
    await db.insert(userPermissions).values(batch).onConflictDoNothing();
  }
  
  console.log('✅ Added random permissions');
}

async function cleanup() {
  console.log('🧹 Cleaning up existing file system data...');
  
  // Delete in order due to foreign key constraints
  await db.delete(userPermissions);
  console.log('  - Deleted permissions');
  
  await db.delete(fsRoots);
  console.log('  - Deleted roots');
  
  await db.delete(fsObjects);
  console.log('  - Deleted fs objects');
  
  // Delete test users but keep the main user
  await db.execute(sql`DELETE FROM "User" WHERE email LIKE 'user%@test.com'`);
  console.log('  - Deleted test users');
  
  console.log('✅ Cleanup complete\n');
}

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
  console.log('🚀 Starting stress test data generation...\n');
  
  // Print configuration
  console.log('📋 Configuration:');
  console.log(`  - New users to create: ${CONFIG.NEW_USERS_COUNT}`);
  console.log(`  - Organizational roots: ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} (depth: ${CONFIG.ORGANIZATIONAL_ROOT_DEPTH})`);
  console.log(`  - Personal root depth range: ${CONFIG.PERSONAL_ROOT_MIN_DEPTH}-${CONFIG.PERSONAL_ROOT_MAX_DEPTH}`);
  console.log(`  - Personal root files range: ${CONFIG.PERSONAL_ROOT_MIN_FILES}-${CONFIG.PERSONAL_ROOT_MAX_FILES}`);
  console.log(`  - Folder permission chance: ${CONFIG.FOLDER_PERMISSION_CHANCE * 100}%`);
  console.log();
  
  try {
    // 0. Cleanup existing data
    await cleanup();
    
    // 1. Create users
    const newUsers = await createUsers();
    console.log();

    // 2. Get all user IDs (including existing user)
    const allUserIds = [...newUsers.map(u => u.id), CONFIG.EXISTING_USER_UUID];
    console.log(`Total users available: ${allUserIds.length} (${newUsers.length} new + 1 existing)`);
    console.log();

    // 3. Create organizational roots (with random owners)
    await createOrganizationalRoots(allUserIds);
    console.log();

    // 4. Create personal roots (including for existing user)
    await createPersonalRoots(allUserIds);
    console.log();

    // 5. Add permissions
    await addRandomPermissions(allUserIds);
    console.log();

    console.log('✨ Stress test data generation complete!');
    console.log('\n📊 Summary:');
    console.log(`  - Total users: ${allUserIds.length} (${newUsers.length} new + 1 existing)`);
    console.log(`  - Organizational roots: ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} (depth ${CONFIG.ORGANIZATIONAL_ROOT_DEPTH}, ${CONFIG.ORGANIZATIONAL_ROOT_FILES_PER_LAYER} files per layer)`);
    console.log(`  - Personal roots: ${allUserIds.length} (depth ${CONFIG.PERSONAL_ROOT_MIN_DEPTH}-${CONFIG.PERSONAL_ROOT_MAX_DEPTH}, ${CONFIG.PERSONAL_ROOT_MIN_FILES}-${CONFIG.PERSONAL_ROOT_MAX_FILES} files)`);
    console.log(`  - Random permissions assigned to ~${Math.round(CONFIG.FOLDER_PERMISSION_CHANCE * 100)}% of folders`);
    console.log(`  - All root owners have admin permissions`);
    
  } catch (error) {
    console.error('❌ Error during stress test:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main();