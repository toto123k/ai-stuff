import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { user, fsObjects, fsRoots, userPermissions, chunks, type ChunkMetadata } from '../lib/db/schema';
import { eq, sql, and } from 'drizzle-orm';

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

    // Chunks (RAG)
    MIN_CHUNKS_PER_FILE: 1,
    MAX_CHUNKS_PER_FILE: 5,

    // Batch processing
    PERMISSION_BATCH_SIZE: 100,
    CONCURRENCY_LIMIT: 5,
} as const;

import {
    uploadFileWithContent,
    setUpNewUser,
    getPersonalRoot,
    getTemporaryRoot
} from '../lib/db/fs-queries';

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

function generateChunkContent(pageNum: number): string {
    const sentences = [
        "This is sample text extracted from the document.",
        "The content represents a chunk for RAG search.",
        "Documents are split into multiple chunks for better retrieval.",
        "Each chunk contains relevant information from a specific section.",
        "This helps improve search accuracy and context relevance.",
    ];
    const numSentences = random(2, 5);
    const selected = pickRandom(sentences, numSentences);
    return `[Page ${pageNum}] ${selected.join(" ")} ${LOREM_IPSUM.slice(0, random(100, 300))}`;
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
                    return;
                }

                // Create random chunks for this file
                const fsObject = result.value;
                const numChunks = random(CONFIG.MIN_CHUNKS_PER_FILE, CONFIG.MAX_CHUNKS_PER_FILE);
                const s3Path = fsObject.path.replace(/\./g, '/');

                const chunkValues = Array.from({ length: numChunks }, (_, chunkIdx) => ({
                    fsObjectId: fsObject.id,
                    content: generateChunkContent(chunkIdx + 1),
                    metadata: {
                        pageId: chunkIdx + 1,
                        documentId: `doc-${fsObject.id}`,
                        path: s3Path,
                    } as ChunkMetadata,
                }));

                await db.insert(chunks).values(chunkValues);
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

async function populateUserRoots(allUserIds: string[]) {
    console.log(`Setting up roots and populating for ${allUserIds.length} users...`);

    const tasks = allUserIds.map((userId) => async () => {
        // 1. Setup User (Creates Personal and Temp roots)
        const setupRes = await setUpNewUser(userId);
        if (setupRes.isErr()) {
            console.error(`Failed to setup user ${userId}:`, setupRes.error);
            return;
        }

        // 2. Get Roots to populate
        // We need to query them since setUpNewUser doesn't return the IDs
        const personalRootRes = await getPersonalRoot(userId);
        const tempRootRes = await getTemporaryRoot(userId); // Need to import this

        if (!personalRootRes.rootFolderId || !tempRootRes.rootFolderId) {
            console.error(`Roots not found for user ${userId}`);
            return;
        }

        // 3. Populate Personal Root
        const depth = random(CONFIG.PERSONAL_ROOT_MIN_DEPTH, CONFIG.PERSONAL_ROOT_MAX_DEPTH);
        const filesCount = random(CONFIG.PERSONAL_ROOT_MIN_FILES, CONFIG.PERSONAL_ROOT_MAX_FILES);

        // Create subfolders/files INSIDE the personal root
        await createFolderWithFiles(
            `Personal Data`,
            personalRootRes.rootFolderId,
            1,
            depth,
            filesCount,
            userId
        );

        // 4. Populate Temporary Root with ~3 files
        const tempFilesCount = 3;
        const tempFileTasks = Array.from({ length: tempFilesCount }, async (_, i) => {
            const ext = Math.random() > 0.5 ? 'pdf' : 'docx';
            const fileName = `temp_file_${i + 1}_${Date.now()}.${ext}`;
            const { content, contentType } = generateDummyContent(ext);

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            try {
                await uploadFileWithContent(
                    tempRootRes.rootFolderId!,
                    fileName,
                    content,
                    contentType,
                    userId,
                    { expiresAt }
                );
            } catch (e) {
                console.error(`Failed to upload temp file for ${userId}`, e);
            }
        });
        await Promise.all(tempFileTasks);
    });

    await runConcurrent(tasks, CONFIG.CONCURRENCY_LIMIT);

    console.log('✅ Populated roots for all users');
}

async function addRandomPermissions(allUserIds: string[]) {
    console.log('Adding random permissions...');

    const allFolders = await db.select().from(fsObjects).where(eq(fsObjects.type, 'folder'));
    const allFiles = await db.select().from(fsObjects).where(eq(fsObjects.type, 'file'));
    console.log(`  Found ${allFolders.length} folders and ${allFiles.length} files`);

    // Sort folders by path depth (shallowest first) so we share parents before children
    const sortedFolders = [...allFolders].sort((a, b) =>
        a.path.split('.').length - b.path.split('.').length
    );

    // Track which paths each user has access to (to avoid sharing descendants)
    const userSharedPaths = new Map<string, string[]>();
    for (const userId of allUserIds) {
        userSharedPaths.set(userId, []);
    }

    const permissions: { userId: string; folderId: number; permission: 'read' | 'write' | 'admin' }[] = [];

    // Share folders (avoiding nested sharing)
    for (const folder of sortedFolders) {
        if (Math.random() > CONFIG.FOLDER_PERMISSION_CHANCE) continue;

        const numUsers = random(
            CONFIG.MIN_USERS_PER_FOLDER,
            Math.min(CONFIG.MAX_USERS_PER_FOLDER, allUserIds.length)
        );
        const selectedUsers = pickRandom(allUserIds, numUsers);

        for (const userId of selectedUsers) {
            // Check if user already has access to an ancestor of this folder
            const userPaths = userSharedPaths.get(userId)!;
            const isDescendantOfShared = userPaths.some(sharedPath =>
                folder.path.startsWith(sharedPath + '.')
            );

            if (isDescendantOfShared) {
                continue; // Skip - user already has access via parent folder
            }

            const permTypes = ['read', 'write', 'admin'] as const;
            const permission = permTypes[random(0, 2)];

            permissions.push({
                userId,
                folderId: folder.id,
                permission,
            });

            // Track this path for this user
            userPaths.push(folder.path);
        }
    }

    // Share some individual files FROM other users' personal roots TO the main user
    // We need to find files that belong to other users' personal roots
    const otherUserIds = allUserIds.filter(id => id !== CONFIG.EXISTING_USER_UUID);
    const mainUserPaths = userSharedPaths.get(CONFIG.EXISTING_USER_UUID) || [];

    // Get personal root paths for other users
    const otherPersonalRootPaths: string[] = [];
    for (const userId of otherUserIds) {
        const personalRoot = await db.select({ path: fsObjects.path })
            .from(fsRoots)
            .innerJoin(fsObjects, eq(fsRoots.rootFolderId, fsObjects.id))
            .innerJoin(userPermissions, and(
                eq(userPermissions.folderId, fsRoots.rootFolderId),
                eq(userPermissions.permission, 'owner'),
                eq(userPermissions.userId, userId)
            ))
            .where(eq(fsRoots.type, 'personal'))
            .limit(1);
        if (personalRoot[0]) {
            otherPersonalRootPaths.push(personalRoot[0].path);
        }
    }

    // Filter files to only those inside other users' personal roots
    const filesFromOthersPersonalRoots = allFiles.filter(file =>
        otherPersonalRootPaths.some(rootPath =>
            file.path === rootPath || file.path.startsWith(rootPath + '.')
        )
    );

    console.log(`  Files in other users' personal roots: ${filesFromOthersPersonalRoots.length}`);

    const FILE_SHARE_CHANCE = 0.5; // 50% chance for eligible files
    let filesShared = 0;
    for (const file of filesFromOthersPersonalRoots) {
        if (Math.random() > FILE_SHARE_CHANCE) continue;

        // Check if main user already has access via a shared folder
        const isDescendantOfShared = mainUserPaths.some(sharedPath =>
            file.path.startsWith(sharedPath + '.')
        );

        if (isDescendantOfShared) {
            continue; // Skip - main user already has access via parent folder
        }

        const permTypes = ['read', 'write', 'admin'] as const;
        const permission = permTypes[random(0, 2)];

        permissions.push({
            userId: CONFIG.EXISTING_USER_UUID,
            folderId: file.id,
            permission,
        });
        filesShared++;
    }

    console.log(`  Files shared individually: ${filesShared}`);
    console.log(`  Adding ${permissions.length} permission entries...`);

    for (let i = 0; i < permissions.length; i += CONFIG.PERMISSION_BATCH_SIZE) {
        const batch = permissions.slice(i, i + CONFIG.PERMISSION_BATCH_SIZE);
        await db.insert(userPermissions).values(batch).onConflictDoNothing();
    }

    console.log('✅ Added random permissions');
}

async function cleanup() {
    console.log('🧹 Cleaning up existing file system data...');

    await db.delete(chunks);
    // console.log('  - Deleted chunks');

    await db.delete(userPermissions);
    // console.log('  - Deleted permissions');

    await db.delete(fsRoots);
    // console.log('  - Deleted roots');

    await db.delete(fsObjects);
    // console.log('  - Deleted fs objects');

    // Delete test users but keep the main user
    await db.execute(sql`DELETE FROM "User" WHERE email LIKE 'user%@test.com'`);
    // console.log('  - Deleted test users');

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

        await populateUserRoots(allUserIds);
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