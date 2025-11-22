import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { user, fsObjects, fsRoots, userPermissions } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Database connection
const connectionString = process.env.POSTGRES_URL!;
const client = postgres(connectionString, { max: 20 }); // Increase max connections for concurrency
const db = drizzle(client);

// ========================================
// CONFIGURATION PARAMETERS
// ========================================
const CONFIG = {
    EXISTING_USER_UUID: '1a4fd90c-46a2-441c-ab1c-5b93f6d9d317',

    // User generation
    NEW_USERS_COUNT: 99, // Total ~100 users

    // Organizational roots
    ORGANIZATIONAL_ROOTS_COUNT: 25,
    ORGANIZATIONAL_ROOT_DEPTH: 5,
    ORGANIZATIONAL_ROOT_FILES_PER_LAYER: 25,

    // Personal roots
    PERSONAL_ROOT_MIN_DEPTH: 3,
    PERSONAL_ROOT_MAX_DEPTH: 4,
    PERSONAL_ROOT_MIN_FILES: 1,
    PERSONAL_ROOT_MAX_FILES: 100,

    // Folder structure
    SUBFOLDERS_PER_LEVEL: 5,

    // Permissions
    FOLDER_PERMISSION_CHANCE: 0.3, // 30% chance a folder gets permissions
    MIN_USERS_PER_FOLDER: 1,
    MAX_USERS_PER_FOLDER: 5,

    // Batch processing
    PERMISSION_BATCH_SIZE: 1000, // Increased batch size
    CONCURRENCY_LIMIT: 10,
} as const;

// ========================================
// UTILITY FUNCTIONS
// ========================================
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = <T,>(arr: T[], count: number): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// Simple concurrency limiter
async function pMap<T, R>(
    items: T[],
    mapper: (item: T, index: number) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
        const p = mapper(items[i], i).then(res => {
            results[i] = res;
        });
        executing.push(p);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Remove completed promises (this is a bit naive but works for simple cases)
            // A better way is to track which promise finished, but for this script it's fine
            // actually Promise.race doesn't tell us which one finished easily without wrapping.
            // Let's use a simpler queue approach.
        }
        // Clean up executing array to avoid memory leaks if we were doing this properly,
        // but for a seed script, let's just use a proper queue implementation below.
    }
    await Promise.all(executing);
    return results;
}

// Better queue implementation
async function runConcurrent<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
): Promise<T[]> {
    const results: T[] = [];
    const queue = [...tasks];
    const workers = [];

    for (let i = 0; i < concurrency; i++) {
        workers.push(
            (async () => {
                while (queue.length > 0) {
                    const task = queue.shift();
                    if (task) {
                        try {
                            const res = await task();
                            results.push(res);
                        } catch (e) {
                            console.error('Task failed', e);
                        }
                    }
                }
            })()
        );
    }

    await Promise.all(workers);
    return results;
}

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

    // Batch insert users
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
    // Create folder
    const [folder] = await db.insert(fsObjects).values({
        name,
        type: 'folder',
        path: '0', // Temporary
    }).returning();

    // Update path
    const folderPath = parentId ? `${parentId}.${folder.id}` : `${folder.id}`;
    await db.execute(sql`
    UPDATE fs_objects 
    SET path = ${folderPath}::ltree 
    WHERE id = ${folder.id}
  `);

    // Create files in batch
    if (filesPerLayer > 0) {
        const filesToInsert = Array.from({ length: filesPerLayer }, (_, i) => ({
            name: `file_${i + 1}.txt`,
            type: 'file' as const,
            path: '0', // Temporary
        }));

        const createdFiles = await db.insert(fsObjects).values(filesToInsert).returning();

        // Update file paths in batch (using a CTE or just parallel updates)
        // Parallel updates are simpler to write here
        await Promise.all(createdFiles.map(file =>
            db.execute(sql`
        UPDATE fs_objects 
        SET path = ${`${folderPath}.${file.id}`}::ltree 
        WHERE id = ${file.id}
      `)
        ));
    }

    // Recurse if we haven't reached max depth
    if (depth < maxDepth) {
        const subfolderTasks = Array.from({ length: CONFIG.SUBFOLDERS_PER_LEVEL }, (_, i) => () =>
            createFolderWithFiles(
                `folder_${depth + 1}_${i + 1}`,
                folder.id,
                depth + 1,
                maxDepth,
                filesPerLayer
            )
        );

        // Run subfolder creation in parallel
        await Promise.all(subfolderTasks.map(task => task()));
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

    const tasks = Array.from({ length: CONFIG.ORGANIZATIONAL_ROOTS_COUNT }, (_, i) => async () => {
        const index = i + 1;
        // console.log(`  Creating org root ${index}/${CONFIG.ORGANIZATIONAL_ROOTS_COUNT}...`); // Too verbose with concurrency

        const randomOwner = pickRandom(allUserIds, 1)[0];

        const rootFolderId = await createFolderWithFiles(
            `org_root_${index}`,
            null,
            1,
            CONFIG.ORGANIZATIONAL_ROOT_DEPTH,
            CONFIG.ORGANIZATIONAL_ROOT_FILES_PER_LAYER
        );

        await db.insert(fsRoots).values({
            rootFolderId,
            ownerId: randomOwner,
            type: 'organizational',
        });

        await giveOwnerAdminPermission(randomOwner, rootFolderId);
    });

    await runConcurrent(tasks, CONFIG.CONCURRENCY_LIMIT);

    console.log(`✅ Created ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} organizational roots`);
}

async function createPersonalRoot(userId: string, userIndex: number) {
    const depth = random(CONFIG.PERSONAL_ROOT_MIN_DEPTH, CONFIG.PERSONAL_ROOT_MAX_DEPTH);
    const filesCount = random(CONFIG.PERSONAL_ROOT_MIN_FILES, CONFIG.PERSONAL_ROOT_MAX_FILES);

    // console.log(`  Creating personal root for user ${userIndex}...`);

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

    await giveOwnerAdminPermission(userId, rootFolderId);
}

async function createPersonalRoots(allUserIds: string[]) {
    console.log(`Creating personal roots for all ${allUserIds.length} users...`);

    const tasks = allUserIds.map((userId, i) => () => createPersonalRoot(userId, i + 1));
    await runConcurrent(tasks, CONFIG.CONCURRENCY_LIMIT);

    console.log('✅ Created personal roots for all users');
}

async function addRandomPermissions(allUserIds: string[]) {
    console.log('Adding random permissions...');

    const allFolders = await db.select().from(fsObjects).where(eq(fsObjects.type, 'folder'));
    console.log(`  Found ${allFolders.length} folders to assign permissions to`);

    const permissions = [];

    for (const folder of allFolders) {
        if (Math.random() > CONFIG.FOLDER_PERMISSION_CHANCE) continue;

        const numUsers = random(
            CONFIG.MIN_USERS_PER_FOLDER,
            Math.min(CONFIG.MAX_USERS_PER_FOLDER, allUserIds.length)
        );
        const selectedUsers = pickRandom(allUserIds, numUsers);

        for (const userId of selectedUsers) {
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

    for (let i = 0; i < permissions.length; i += CONFIG.PERMISSION_BATCH_SIZE) {
        const batch = permissions.slice(i, i + CONFIG.PERMISSION_BATCH_SIZE);
        await db.insert(userPermissions).values(batch).onConflictDoNothing();
    }

    console.log('✅ Added random permissions');
}

async function cleanup() {
    console.log('🧹 Cleaning up existing file system data...');

    await db.delete(userPermissions);
    // console.log('  - Deleted permissions'); // Removed for brevity

    await db.delete(fsRoots);
    // console.log('  - Deleted roots'); // Removed for brevity

    await db.delete(fsObjects);
    // console.log('  - Deleted fs objects'); // Removed for brevity

    // Delete test users but keep the main user
    await db.execute(sql`DELETE FROM "User" WHERE email LIKE 'user%@test.com'`);
    // console.log('  - Deleted test users'); // Removed for brevity

    console.log('✅ Cleanup complete\n');
}

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
    console.log('🚀 Starting stress test data generation...\n');

    console.log('📋 Configuration:');
    console.log(`  - New users to create: ${CONFIG.NEW_USERS_COUNT}`);
    console.log(`  - Organizational roots: ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} (depth: ${CONFIG.ORGANIZATIONAL_ROOT_DEPTH})`);
    console.log(`  - Personal root depth range: ${CONFIG.PERSONAL_ROOT_MIN_DEPTH}-${CONFIG.PERSONAL_ROOT_MAX_DEPTH}`);
    console.log(`  - Personal root files range: ${CONFIG.PERSONAL_ROOT_MIN_FILES}-${CONFIG.PERSONAL_ROOT_MAX_FILES}`);
    console.log(`  - Concurrency limit: ${CONFIG.CONCURRENCY_LIMIT}`);
    console.log();

    try {
        await cleanup();

        const newUsers = await createUsers();
        console.log();

        const allUserIds = [...newUsers.map(u => u.id), CONFIG.EXISTING_USER_UUID];
        console.log(`Total users available: ${allUserIds.length}`);
        console.log();

        await createOrganizationalRoots(allUserIds);
        console.log();

        await createPersonalRoots(allUserIds);
        console.log();

        await addRandomPermissions(allUserIds);
        console.log();

        console.log('✨ Stress test data generation complete!');

    } catch (error) {
        console.error('❌ Error during stress test:', error);
        throw error;
    } finally {
        await client.end();
    }
}

main();