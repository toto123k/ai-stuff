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
    NEW_USERS_COUNT: 5,

    // Organizational roots
    ORGANIZATIONAL_ROOTS_COUNT: 3,
    ORGANIZATIONAL_ROOT_DEPTH: 2,
    ORGANIZATIONAL_ROOT_FILES_PER_LAYER: 5,

    // Personal roots
    PERSONAL_ROOT_MIN_DEPTH: 2,
    PERSONAL_ROOT_MAX_DEPTH: 2,
    PERSONAL_ROOT_MIN_FILES: 1,
    PERSONAL_ROOT_MAX_FILES: 10,

    // Folder structure
    SUBFOLDERS_PER_LEVEL: 2,

    // Permissions
    FOLDER_PERMISSION_CHANCE: 0.8,
    MIN_USERS_PER_FOLDER: 1,
    MAX_USERS_PER_FOLDER: 5,

    // Batch processing
    PERMISSION_BATCH_SIZE: 100,
    CONCURRENCY_LIMIT: 5,
} as const;

import { uploadFileWithContent } from '../lib/db/fs-queries';

// ========================================
// UTILITY FUNCTIONS
// ========================================
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = <T,>(arr: T[], count: number): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

const LOREM_IPSUM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

function generateDummyContent(type: 'pdf' | 'docx'): { content: Buffer, contentType: string } {
    // We are just generating text content for now as we don't have pdf-lib/docx installed.
    // S3 doesn't validate the binary format, so this "simulates" a file.
    const repeated = LOREM_IPSUM.repeat(random(10, 50));
    const buffer = Buffer.from(repeated + `\n\nGenerated as pseudo-${type} file.`);

    return {
        content: buffer,
        contentType: type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
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
    filesPerLayer: number,
    userId: string
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

    // IMMEDIATELY give owner admin permission so we can upload files into it
    await giveOwnerAdminPermission(userId, folder.id);

    // Create files using real S3 upload
    if (filesPerLayer > 0) {
        const fileTasks = Array.from({ length: filesPerLayer }, async (_, i) => {
            const ext = Math.random() > 0.5 ? 'pdf' : 'docx';
            const fileName = `file_${i + 1}_${Date.now()}.${ext}`;
            const { content, contentType } = generateDummyContent(ext);

            try {
                // uploadFileWithContent handles DB insert + S3 upload transactionally
                // It requires 'write' permission on parent, which we just granted.
                const result = await uploadFileWithContent(folder.id, fileName, content, contentType, userId);
                if (result.isErr()) {
                    console.error(`Failed to upload ${fileName}:`, result.error);
                }
            } catch (e) {
                console.error(`Failed to upload ${fileName} (exception):`, e);
            }
        });

        // Execute uploads in parallel (limited by db pool but batch is small)
        await Promise.all(fileTasks);
    }

    // Recurse if we haven't reached max depth
    if (depth < maxDepth) {
        const subfolderTasks = Array.from({ length: CONFIG.SUBFOLDERS_PER_LEVEL }, (_, i) => () =>
            createFolderWithFiles(
                `folder_${depth + 1}_${i + 1}`,
                folder.id,
                depth + 1,
                maxDepth,
                filesPerLayer,
                userId
            )
        );

        // Run subfolder creation
        // Note: we use our simple queue/concurrency inside recursion which might limit overall
        // but sticking to Promise.all here for simplicity of the tree
        await Promise.all(subfolderTasks.map(task => task()));
    }

    return folder.id;
}

async function giveOwnerAdminPermission(userId: string, folderId: number) {
    await db.insert(userPermissions).values({
        userId,
        folderId,
        permission: 'owner',
    }).onConflictDoNothing();
}

async function createOrganizationalRoots(allUserIds: string[]) {
    console.log(`Creating ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} organizational root folders...`);

    const tasks = Array.from({ length: CONFIG.ORGANIZATIONAL_ROOTS_COUNT }, (_, i) => async () => {
        const index = i + 1;
        const randomOwner = pickRandom(allUserIds, 1)[0];

        const rootFolderId = await createFolderWithFiles(
            `org_root_${index}`,
            null,
            1,
            CONFIG.ORGANIZATIONAL_ROOT_DEPTH,
            CONFIG.ORGANIZATIONAL_ROOT_FILES_PER_LAYER,
            randomOwner
        );

        await db.insert(fsRoots).values({
            rootFolderId,
            type: 'organizational',
        });

        // Permission already given inside createFolderWithFiles, but adding again is safe (onConflictDoNothing)
    });

    await runConcurrent(tasks, CONFIG.CONCURRENCY_LIMIT);

    console.log(`✅ Created ${CONFIG.ORGANIZATIONAL_ROOTS_COUNT} organizational roots`);
}

async function createPersonalRoot(userId: string, userIndex: number) {
    const depth = random(CONFIG.PERSONAL_ROOT_MIN_DEPTH, CONFIG.PERSONAL_ROOT_MAX_DEPTH);
    const filesCount = random(CONFIG.PERSONAL_ROOT_MIN_FILES, CONFIG.PERSONAL_ROOT_MAX_FILES);

    const rootFolderId = await createFolderWithFiles(
        `personal_${userId.substring(0, 8)}`,
        null,
        1,
        depth,
        filesCount,
        userId
    );

    await db.insert(fsRoots).values({
        rootFolderId,
        type: 'personal',
    });
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