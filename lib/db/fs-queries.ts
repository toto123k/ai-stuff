

import {
  and,
  desc,
  inArray,
  sql,
  aliasedTable,
  eq,
  ne,
  exists,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js"; import postgres from "postgres";

import { Result, ok, err, safeTry, ResultAsync } from "neverthrow";
import { UnexpectedError, PermissionError, NotFoundError, ValidationError, S3Error } from "./fs-errors";
import {
  fsObjects,
  fsRoots,
  userPermissions,
  user,
  type PermType,
  type ObjectType,
  type RootType,
  type FSObject,
} from "./schema";
import { safeTransaction } from "./safe-transaction";


// S3 imports for combined operations
import {
  uploadToS3,
  deleteFromS3,
  copyS3Object,
  fsObjectToS3Key,
} from "@/lib/s3";
import PQueue from "p-queue";

// S3 concurrency limit
const S3_CONCURRENCY = 5;

// ... existing code ...

import {
  isDescendantOf,
  nlevel,
  lqueryMatch,
  ltreeConcat,
  subpath,
  ltreeCast,
  ltreeEq,
  getParentIdFromPath,
  buildChildPath,
} from "./ltree-operators";
import { caseWhen } from "./case-operators";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

const PERM_LEVELS: Record<PermType, number> = {
  read: 1,
  write: 2,
  admin: 3,
  owner: 4,
};



const getNodePathSubquery = (nodeId: number) => {
  return db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, nodeId));


};

const getEffectivePermissionSelect = (userId: string, targetNode: typeof fsObjects) => {
  const permFolder = aliasedTable(fsObjects, "permFolder");

  return sql<PermType | null>`(${db
    .select({ permission: userPermissions.permission })
    .from(userPermissions)
    .innerJoin(permFolder, eq(permFolder.id, userPermissions.folderId))
    .where(
      and(
        eq(userPermissions.userId, userId),
        sql`${targetNode.path} <@ ${permFolder.path}`
      )
    )
    .orderBy(desc(nlevel(permFolder.path)))
    .limit(1)})`;
};

const isFromOtherPersonalRootSubquery = (
  objectPath: typeof fsObjects.path,
  excludeUserId: string
) => {
  const rootObj = aliasedTable(fsObjects, "root_obj");

  return db
    .select({ one: sql<number>`1` })
    .from(fsRoots)
    .innerJoin(rootObj, eq(fsRoots.rootFolderId, rootObj.id))
    .innerJoin(userPermissions, and(
      eq(userPermissions.folderId, rootObj.id),
      eq(userPermissions.permission, "owner")
    ))
    .where(
      and(
        isDescendantOf(objectPath, rootObj.path),
        eq(fsRoots.type, "personal"),
        ne(userPermissions.userId, excludeUserId)
      )
    )
    .limit(1);
};



export async function getEffectivePermission(
  userId: string,
  nodeId: number
): Promise<Result<PermType | null, NotFoundError | UnexpectedError>> {

  try {
    // Check if user exists
    const [userExists] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userExists) {
      return err({ type: "USER_NOT_FOUND", userId });
    }

    // Check if object exists
    const [objectExists] = await db
      .select({ id: fsObjects.id })
      .from(fsObjects)
      .where(eq(fsObjects.id, nodeId))
      .limit(1);

    if (!objectExists) {
      return err({ type: "OBJECT_NOT_FOUND", objectId: nodeId });
    }

    const permFolder = aliasedTable(fsObjects, "permFolder");

    const nodePathSubquery = getNodePathSubquery(nodeId);

    const perms = await db
      .select({
        permission: userPermissions.permission,
      })
      .from(userPermissions)
      .innerJoin(permFolder, eq(permFolder.id, userPermissions.folderId))
      .where(
        and(
          eq(userPermissions.userId, userId),
          sql`(${nodePathSubquery}) <@ ${permFolder.path}`
        )
      )
      .orderBy(desc(nlevel(permFolder.path)))
      .limit(1);

    if (perms.length > 0) {
      return ok(perms[0].permission);
    }

    return ok(null);
  } catch (error) {
    console.error("Failed to check permissions", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function doesPathExist(path: string): Promise<boolean> {
  const [node] = await db
    .select({ id: fsObjects.id })
    .from(fsObjects)
    .where(ltreeEq(fsObjects.path, path));
  return !!node;
}

/**
 * Helper to check permission on an object.
 */
async function checkReqPermission(
  userId: string,
  objectId: number,
  required: PermType,
  resourceType: "file" | "folder" = "folder"
): Promise<Result<PermType, PermissionError | NotFoundError | UnexpectedError>> {
  const permResult = await getEffectivePermission(userId, objectId);
  if (permResult.isErr()) return err(permResult.error);

  const perm = permResult.value;
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS[required]) {
    return err({ type: "NO_PERMISSION", resource: resourceType, required });
  }
  return ok(perm);
}

/**
 * Get the minimum permission level for a user across a set of objects and all their descendants.
 * Returns null if any object or descendant has no permission.
 */
export async function getMinPermissionForObjects(
  userId: string,
  objectIds: number[]
): Promise<PermType | null> {
  if (objectIds.length === 0) return null;

  try {
    // Get all source objects and their descendants
    const sourceObjects = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(inArray(fsObjects.id, objectIds));

    if (sourceObjects.length === 0) return null;

    const sourcePaths = sourceObjects.map(s => s.path);

    // Get all objects (sources + descendants)
    const allObjects = await db
      .select({
        id: fsObjects.id,
        permission: getEffectivePermissionSelect(userId, fsObjects),
      })
      .from(fsObjects)
      .where(
        sql`${fsObjects.path} <@ ANY(ARRAY[${sql.join(sourcePaths.map(p => sql`${p}::ltree`), sql`, `)}])`
      );

    if (allObjects.length === 0) return null;

    // Find minimum permission
    let minPermLevel: number | null = null;
    for (const obj of allObjects) {
      if (obj.permission === null) {
        return null; // No permission on at least one object
      }
      const level = PERM_LEVELS[obj.permission];
      if (minPermLevel === null || level < minPermLevel) {
        minPermLevel = level;
      }
    }

    // Convert back to permission type
    if (minPermLevel === null) return null;
    const permTypes = Object.entries(PERM_LEVELS);
    const found = permTypes.find(([_, level]) => level === minPermLevel);
    return found ? found[0] as PermType : null;
  } catch (error) {
    console.error("Failed to get min permission", error);
    return null;
  }
}

/**
 * Extract root ID from a path (the first segment)
 */
export function getRootIdFromPath(path: string): number {
  const parts = path.split(".");
  return parseInt(parts[0], 10);
}

/**
 * Check if an object is a root folder (registered in fs_roots)
 */
export async function isRootFolder(objectId: number): Promise<boolean> {
  const [root] = await db
    .select({ id: fsRoots.id })
    .from(fsRoots)
    .where(eq(fsRoots.rootFolderId, objectId));
  return !!root;
}

/**
 * Check if all objects are in the same root
 */
export async function getObjectsRoots(objectIds: number[]): Promise<Map<number, number>> {
  if (objectIds.length === 0) return new Map();

  const objects = await db
    .select({ id: fsObjects.id, path: fsObjects.path })
    .from(fsObjects)
    .where(inArray(fsObjects.id, objectIds));

  const rootMap = new Map<number, number>();
  for (const obj of objects) {
    rootMap.set(obj.id, getRootIdFromPath(obj.path));
  }
  return rootMap;
}


export async function createCollectionRoot(
  ownerId: string,
  type: RootType
): Promise<Result<FSObject, UnexpectedError>> {
  return safeTransaction(db, async (tx) => {
    const [rootFolder] = await tx
      .insert(fsObjects)
      .values({
        name: "Root",
        type: "folder",
        path: "0", // Temporary path, will update with ID
      })
      .returning();

    const newPath = `${rootFolder.id}`;
    await tx
      .update(fsObjects)
      .set({ path: newPath })
      .where(eq(fsObjects.id, rootFolder.id));

    await tx.insert(fsRoots).values({
      rootFolderId: rootFolder.id,
      type,
    });

    await tx.insert(userPermissions).values({
      userId: ownerId,
      folderId: rootFolder.id,
      permission: "owner",
    });

    return ok({ ...rootFolder, path: newPath });
  });
}

export async function createFolder(
  parentId: number,
  name: string,
  userId: string
): Promise<Result<FSObject, PermissionError | NotFoundError | UnexpectedError>> {
  const permResult = await checkReqPermission(userId, parentId, "write", "folder");
  if (permResult.isErr()) return err(permResult.error);

  try {
    return await safeTransaction(db, async (tx) => {
      const [parent] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, parentId));

      if (!parent) return err({ type: "PARENT_NOT_FOUND" as const, parentId });

      const [folder] = await tx
        .insert(fsObjects)
        .values({
          name,
          type: "folder",
          path: "0", // Temp
        })
        .returning();

      const newPath = `${parent.path}.${folder.id}`;
      await tx
        .update(fsObjects)
        .set({ path: newPath })
        .where(eq(fsObjects.id, folder.id));

      return ok({ ...folder, path: newPath });
    });
  } catch (error) {
    console.error("Failed to create folder", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function uploadFile(
  parentId: number,
  name: string,
  userId: string
): Promise<Result<FSObject, PermissionError | NotFoundError | UnexpectedError>> {
  const permResult = await checkReqPermission(userId, parentId, "write", "folder");
  if (permResult.isErr()) return err(permResult.error);

  try {
    return await safeTransaction(db, async (tx) => {
      const [parent] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, parentId));

      if (!parent) return err({ type: "PARENT_NOT_FOUND" as const, parentId });

      const [file] = await tx
        .insert(fsObjects)
        .values({
          name,
          type: "file",
          path: "0",
        })
        .returning();

      const newPath = `${parent.path}.${file.id}`;
      await tx
        .update(fsObjects)
        .set({ path: newPath })
        .where(eq(fsObjects.id, file.id));

      return ok({ ...file, path: newPath });
    });
  } catch (error) {
    console.error("Failed to upload file", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}


export async function getFile(fileId: number, userId: string): Promise<Result<FSObject, PermissionError | NotFoundError | UnexpectedError>> {
  const permResult = await checkReqPermission(userId, fileId, "read", "file");
  if (permResult.isErr()) return err(permResult.error);

  try {
    const [file] = await db
      .select()
      .from(fsObjects)
      .where(eq(fsObjects.id, fileId));

    if (!file) {
      return err({ type: "OBJECT_NOT_FOUND", objectId: fileId });
    }

    return ok(file);
  } catch (error) {
    console.error("Failed to get file", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function deleteObject(objectId: number, userId: string): Promise<Result<boolean, PermissionError | NotFoundError | UnexpectedError>> {
  try {
    const [obj] = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(eq(fsObjects.id, objectId));

    if (!obj) return err({ type: "OBJECT_NOT_FOUND", objectId });

    const parts = obj.path.split(".");
    const parentId = parts.length > 1 ? parseInt(parts[parts.length - 2]) : null;

    if (!parentId) {
      const permResult = await checkReqPermission(userId, objectId, "admin", "file");
      if (permResult.isErr()) return err(permResult.error);
    } else {
      const permResult = await checkReqPermission(userId, parentId, "write", "folder");
      if (permResult.isErr()) return err(permResult.error);
    }

    await db.delete(fsObjects).where(isDescendantOf(fsObjects.path, obj.path));
    return ok(true);
  } catch (error) {
    console.error("Failed to delete object", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function updateObject(
  objectId: number,
  updates: { name?: string; parentId?: number },
  userId: string
): Promise<Result<void, PermissionError | NotFoundError | UnexpectedError | ValidationError>> {
  const objPermResult = await checkReqPermission(userId, objectId, "write", "file");
  if (objPermResult.isErr()) return err(objPermResult.error);

  // Check new parent permission
  if (updates.parentId) {
    const parentPermResult = await checkReqPermission(userId, updates.parentId, "write", "folder");
    if (parentPermResult.isErr()) {
      // Convert simplified error to specific error if needed, but existing logic used generic NO_PERMISSION.
      // The original code returned NO_PERMISSION_ON_TARGET for folderId specifically.
      // We can just return the error from helper, or map it.
      // Original: return err({ type: "NO_PERMISSION_ON_TARGET", folderId: updates.parentId });
      // Let's stick to the helper's return for consistency, or manually check if we want exact error type.
      // To match original behavior exactly:
      if (parentPermResult.error.type === "NO_PERMISSION") {
        return err({ type: "NO_PERMISSION_ON_TARGET", folderId: updates.parentId });
      }
      return err(parentPermResult.error);
    }
  }

  try {
    await safeTransaction(db, async (tx) => {
      if (updates.parentId) {
        // ... Logic remains same ...
        // safeTransaction expects Result return, but updateObject returns Result<void>.
        // We need to wrap logic in Result.

        const [obj] = await tx.select().from(fsObjects).where(eq(fsObjects.id, objectId));
        const [newParent] = await tx.select().from(fsObjects).where(eq(fsObjects.id, updates.parentId!));

        if (!obj || !newParent) return err({ type: "OBJECT_NOT_FOUND" as const }); // Logic check

        const oldPath = obj.path;
        const newPath = buildChildPath(newParent.path, obj.id);

        await tx.update(fsObjects).set({
          name: updates.name || obj.name,
          path: newPath
        }).where(eq(fsObjects.id, objectId));

        await tx
          .update(fsObjects)
          .set({
            path: sql`${ltreeConcat(ltreeCast(newPath), subpath(fsObjects.path, nlevel(oldPath)))}`
          })
          .where(
            and(
              isDescendantOf(fsObjects.path, oldPath),
              ne(fsObjects.id, objectId)
            )
          );
      } else if (updates.name) {
        await tx.update(fsObjects).set({ name: updates.name }).where(eq(fsObjects.id, objectId));
      }
      return ok();
    });

    return ok();
  } catch (error) {
    console.error("Failed to update object", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function addPermission(
  targetUserId: string,
  folderId: number,
  permission: PermType,
  actorId: string
): Promise<Result<{ success: true } | { message: string }, PermissionError | NotFoundError | UnexpectedError>> {
  const [actorPermResult, targetPermResult] = await Promise.all([
    checkReqPermission(actorId, folderId, "admin", "folder"),
    getEffectivePermission(targetUserId, folderId),
  ]);

  if (actorPermResult.isErr()) return err(actorPermResult.error);
  // actorPerm verified by helper

  if (targetPermResult.isErr()) return err(targetPermResult.error);
  const targetEffective = targetPermResult.value;

  if (targetEffective && PERM_LEVELS[targetEffective] >= PERM_LEVELS[permission]) {
    // This is technically a success or a specific "no-op" state, previously returned object
    return ok({ message: "User already has equal or higher permission" });
  }

  try {
    await db
      .insert(userPermissions)
      .values({
        userId: targetUserId,
        folderId,
        permission,
      })
      .onConflictDoUpdate({
        target: [userPermissions.userId, userPermissions.folderId],
        set: { permission },
      });

    return ok({ success: true });
  } catch (error) {
    console.error("Failed to add permission", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

export async function getPermissions(objectID: number, userId: string): Promise<Result<Array<{ userId: string; email: string; permission: PermType }>, PermissionError | NotFoundError | UnexpectedError>> {
  const permResult = await checkReqPermission(userId, objectID, "admin", "folder");
  if (permResult.isErr()) return err(permResult.error);

  try {
    const permFolderPath = aliasedTable(fsObjects, "permFolderPath");
    const targetObj = aliasedTable(fsObjects, "targetObj");
    const ancestorObj = aliasedTable(fsObjects, "ancestorObj");

    const permFolderPathSubquery = sql`(${db
      .select({ path: permFolderPath.path })
      .from(permFolderPath)
      .where(eq(permFolderPath.id, userPermissions.folderId))})`;

    const targetPathSubquery = sql`(${db
      .select({ path: targetObj.path })
      .from(targetObj)
      .where(eq(targetObj.id, objectID))})`;

    const ancestorPathSubquery = sql`(${db
      .select({ path: ancestorObj.path })
      .from(ancestorObj)
      .where(eq(ancestorObj.id, userPermissions.folderId))})`;

    const result = await db
      .select({
        userId: userPermissions.userId,
        permission: userPermissions.permission,
        folderId: userPermissions.folderId,
        email: user.email,
        depth: nlevel(permFolderPathSubquery),
      })
      .from(userPermissions)
      .innerJoin(user, eq(userPermissions.userId, user.id))
      .where(
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(targetObj)
            .where(
              and(
                eq(targetObj.id, objectID),
                isDescendantOf(targetPathSubquery, ancestorPathSubquery)
              )
            )
        )
      );

    const effectivePerms = new Map<string, { userId: string; email: string; permission: PermType }>();

    for (const p of result) {
      const current = effectivePerms.get(p.userId);
      const newLevel = PERM_LEVELS[p.permission];

      if (!current || newLevel > PERM_LEVELS[current.permission]) {
        effectivePerms.set(p.userId, {
          userId: p.userId,
          email: p.email,
          permission: p.permission,
        });
      }
    }

    return ok(Array.from(effectivePerms.values()));
  } catch (error) {
    console.error("Failed to get permissions", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}





export async function getObjects(folderId: number, userId: string) {
  const [folder] = await db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, folderId));

  if (!folder) return [];

  return db
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      createdAt: fsObjects.createdAt,
      permission: getEffectivePermissionSelect(userId, fsObjects),
    })
    .from(fsObjects)
    .where(
      and(
        isDescendantOf(fsObjects.path, folder.path),
        sql`${nlevel(fsObjects.path)} = ${nlevel(folder.path)} + 1`
      )
    )
    .orderBy(desc(fsObjects.type), fsObjects.name);
}

export async function getPersonalRoot(userId: string) {
  const [root] = await db
    .select({ rootFolderId: fsRoots.rootFolderId })
    .from(fsRoots)
    .innerJoin(userPermissions, and(
      eq(userPermissions.folderId, fsRoots.rootFolderId),
      eq(userPermissions.permission, "owner"),
      eq(userPermissions.userId, userId)
    ))
    .where(eq(fsRoots.type, "personal"));

  if (!root) return { objects: [], rootFolderId: null };

  const objects = await getObjects(root.rootFolderId, userId);
  return { objects, rootFolderId: root.rootFolderId };
}

export async function getSharedRoot(userId: string) {
  const objects = await getSharedObjects(userId);
  return { objects, rootFolderId: null }; // No single root for shared items
}

export async function getSharedObjects(userId: string) {
  return db
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      createdAt: fsObjects.createdAt,
      permission: userPermissions.permission,
    })
    .from(userPermissions)
    .innerJoin(fsObjects, eq(userPermissions.folderId, fsObjects.id))
    .where(
      and(
        eq(userPermissions.userId, userId),
        exists(isFromOtherPersonalRootSubquery(fsObjects.path, userId)),
      )
    )
    .orderBy(desc(fsObjects.type), fsObjects.name);
}

export async function getOrganizationalRootFolders(userId: string) {
  const orgRoots = await db
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      createdAt: fsObjects.createdAt,
      permission: getEffectivePermissionSelect(userId, fsObjects),
    })
    .from(fsRoots)
    .innerJoin(fsObjects, eq(fsRoots.rootFolderId, fsObjects.id))
    .where(eq(fsRoots.type, "organizational"));

  return orgRoots;
}

export interface TreeNode {
  id: number;
  name: string;
  type: "file" | "folder";
  path: string;
  createdAt: Date | null;
  permission: PermType | null;
  children: TreeNode[] | null; // null = unloaded (at max depth), [] = loaded but empty
}

export async function getTreeHierarchy(
  startFolderId: number,
  userId: string,
  maxDepth: number = 2
): Promise<TreeNode | null> {
  const startPathSubquery = db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, startFolderId));

  const allNodes = await db
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      createdAt: fsObjects.createdAt,
      permission: getEffectivePermissionSelect(userId, fsObjects),
      level: sql<number>`nlevel(${fsObjects.path})`,
      parentId: sql<number | null>`
        CASE WHEN nlevel(${fsObjects.path}) > 1 
        THEN (subpath(${fsObjects.path}, nlevel(${fsObjects.path}) - 2, 1)::text)::int 
        ELSE NULL END
      `,
    })
    .from(fsObjects)
    .where(
      and(
        sql`${fsObjects.path} <@ (${startPathSubquery})`,
        sql`nlevel(${fsObjects.path}) <= nlevel((${startPathSubquery})) + ${maxDepth}`
      )
    )
    .orderBy(fsObjects.path);

  if (allNodes.length === 0) return null;

  const startNode = allNodes.find(n => n.id === startFolderId);
  if (!startNode || startNode.permission === null) return null;

  const startLevel = startNode.level;
  const maxLevel = startLevel + maxDepth;

  const nodeMap = new Map<number, TreeNode>();

  for (const node of allNodes) {
    if (node.permission === null) continue;

    nodeMap.set(node.id, {
      id: node.id,
      name: node.name,
      type: node.type as "file" | "folder",
      path: node.path,
      createdAt: node.createdAt,
      permission: node.permission,
      children: node.type === "folder" ? (node.level >= maxLevel ? null : []) : null,
    });
  }

  for (const node of allNodes) {
    if (node.permission === null || node.parentId === null) continue;

    const parent = nodeMap.get(node.parentId);
    const child = nodeMap.get(node.id);

    if (parent && child && parent.type === "folder" && parent.children !== null) {
      parent.children.push(child);
    }
  }

  return nodeMap.get(startFolderId) || null;
}

export async function getRootsWithHierarchy(
  userId: string,
  maxDepth: number = 3
): Promise<{
  personal: TreeNode | null;
  organizational: TreeNode[];
  shared: TreeNode[];
}> {
  const [personalRootResult, orgRootsResult, sharedObjectsResult] = await Promise.all([
    db.select({ rootFolderId: fsRoots.rootFolderId })
      .from(fsRoots)
      .innerJoin(userPermissions, and(
        eq(userPermissions.folderId, fsRoots.rootFolderId),
        eq(userPermissions.permission, "owner"),
        eq(userPermissions.userId, userId)
      ))
      .where(eq(fsRoots.type, "personal")),
    getOrganizationalRootFolders(userId),
    getSharedObjects(userId),
  ]);

  const personalRoot = personalRootResult[0];
  const orgRoots = orgRootsResult;
  const sharedFolders = sharedObjectsResult.filter(obj => obj.type === "folder");

  const rootIdsToFetch: number[] = [];
  if (personalRoot?.rootFolderId) rootIdsToFetch.push(personalRoot.rootFolderId);
  orgRoots.forEach(r => { if (r.permission) rootIdsToFetch.push(r.id); });
  sharedFolders.forEach(f => rootIdsToFetch.push(f.id));

  const treeResults = await Promise.all(
    rootIdsToFetch.map(id => getTreeHierarchy(id, userId, maxDepth))
  );

  let idx = 0;
  const personal = personalRoot?.rootFolderId ? treeResults[idx++] : null;

  const organizational: TreeNode[] = [];
  for (const root of orgRoots) {
    if (root.permission) {
      const tree = treeResults[idx++];
      if (tree) organizational.push(tree);
    } else {
      organizational.push({
        id: root.id,
        name: root.name,
        type: root.type as "file" | "folder",
        path: root.path,
        createdAt: root.createdAt,
        permission: null,
        children: null,
      });
    }
  }

  const shared: TreeNode[] = [];
  for (const folder of sharedFolders) {
    const tree = treeResults[idx++];
    if (tree) shared.push(tree);
  }

  return { personal, organizational, shared };
}

export async function countFilesUnderFolders(folderIds: number[]): Promise<number> {
  if (folderIds.length === 0) return 0;

  try {
    const folders = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(inArray(fsObjects.id, folderIds));

    if (folders.length === 0) return 0;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fsObjects)
      .where(
        and(
          eq(fsObjects.type, "file"),
          isDescendantOf(fsObjects.path, sql`ANY(ARRAY[${sql.join(folders.map(f => sql`${f.path}::ltree`), sql`, `)}])`)
        )
      );

    return result?.count ?? 0;
  } catch (error) {
    console.error("Failed to count files", error);
    return 0;
  }
}

/**
 * Check if any source object names conflict with existing objects in target folder.
 * Only checks direct children of the target folder.
 */
async function checkNameConflicts(
  sourceNames: string[],
  targetFolderPath: string
): Promise<{ name: string; existingId: number }[]> {
  if (sourceNames.length === 0) return [];

  const existing = await db
    .select({ id: fsObjects.id, name: fsObjects.name })
    .from(fsObjects)
    .where(
      and(
        inArray(fsObjects.name, sourceNames),
        // Direct children of target folder: path matches "targetPath.*{1}"
        lqueryMatch(fsObjects.path, `${targetFolderPath}.*{1}`)
      )
    );

  return existing.map(e => ({ name: e.name, existingId: e.id }));
}

/**
 * Copy objects to a target folder.
 * Uses topological ordering (ancestors first) to correctly map parent IDs.
 * 
 * @param sourceIds - Array of object IDs to copy
 * @param targetFolderId - The folder to copy into
 * @param userId - The user performing the copy
 * @param override - If true, delete conflicting objects before copying
 * @returns The number of objects copied
 */
export async function copyObjects(
  sourceIds: number[],
  targetFolderId: number,
  userId: string,
  override: boolean = false
): Promise<Result<{
  copiedCount: number;
  mappings: Array<{ oldId: number; oldPath: string; newId: number; newPath: string; type: ObjectType }>;
}, PermissionError | NotFoundError | ValidationError | UnexpectedError>> {
  if (sourceIds.length === 0) {
    return ok({ copiedCount: 0, mappings: [] });
  }

  // 1. Check permissions
  const permResult = await checkReqPermission(userId, targetFolderId, "write", "folder");
  if (permResult.isErr()) return err(permResult.error);

  const minPerm = await getMinPermissionForObjects(userId, sourceIds);
  if (!minPerm || PERM_LEVELS[minPerm] < PERM_LEVELS.read) {
    return err({ type: "NO_PERMISSION_ON_DESCENDANTS" });
  }

  // 2. Validate move constraints (root check)
  const allIds = [...sourceIds, targetFolderId];
  const rootsMap = await getObjectsRoots(allIds);
  // (root map logic was just unused overhead in copy? targetRootId was unused in original code).
  // Actually, original code generated `targetRootId` but didn't use it for any check in `copyObjects`.
  // `moveObjects` used it. `copyObjects` just calculated it. I'll remove it.

  try {
    const [targetFolder] = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(eq(fsObjects.id, targetFolderId));

    if (!targetFolder) {
      return err({ type: "PARENT_NOT_FOUND", parentId: targetFolderId });
    }

    const sourceObjects = await db
      .select({ id: fsObjects.id, path: fsObjects.path, name: fsObjects.name })
      .from(fsObjects)
      .where(inArray(fsObjects.id, sourceIds));

    if (sourceObjects.length === 0) {
      return ok({ copiedCount: 0, mappings: [] });
    }

    const conflicts = await checkNameConflicts(sourceObjects.map(o => o.name), targetFolder.path);

    if (conflicts.length > 0 && !override) {
      return err({ type: "NAME_ALREADY_EXISTS", name: conflicts[0].name, parentId: targetFolderId });
    }

    const txResult = await safeTransaction(db, async (tx) => {
      if (conflicts.length > 0 && override) {
        await deleteConflicts(tx, conflicts);
      }

      return ok(await performCopy(tx, sourceObjects, sourceIds, targetFolder.path));
    });

    return txResult;

  } catch (error) {
    console.error("Failed to copy objects", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

async function deleteConflicts(tx: Transaction, conflicts: { existingId: number }[]) {
  for (const conflict of conflicts) {
    await tx.delete(fsObjects).where(
      isDescendantOf(fsObjects.path, sql`(SELECT path FROM fs_objects WHERE id = ${conflict.existingId})`)
    );
  }
}

async function performCopy(
  tx: Transaction,
  sourceObjects: { id: number; path: string; name: string }[],
  sourceIds: number[],
  targetFolderPath: string
) {
  const sourcePaths = sourceObjects.map(s => s.path);

  const allObjectsToCopy = await tx
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      level: nlevel(fsObjects.path),
    })
    .from(fsObjects)
    .where(
      sql`${fsObjects.path} <@ ANY(ARRAY[${sql.join(sourcePaths.map(p => sql`${p}::ltree`), sql`, `)}])`
    )
    .orderBy(nlevel(fsObjects.path));

  const idMapping = new Map<number, { newId: number; newPath: string; type: ObjectType; oldPath: string }>();

  for (const obj of allObjectsToCopy) {
    const [newObj] = await tx
      .insert(fsObjects)
      .values({
        name: obj.name,
        type: obj.type,
        path: "0",
      })
      .returning({ id: fsObjects.id });

    let newPath: string;

    if (sourceIds.includes(obj.id)) {
      newPath = `${targetFolderPath}.${newObj.id}`;
    } else {
      const pathParts = obj.path.split(".");
      const oldParentId = parseInt(pathParts[pathParts.length - 2]);
      const newParent = idMapping.get(oldParentId);

      if (!newParent) {
        throw new Error(`Parent ${oldParentId} not found in mapping - this shouldn't happen`);
      }

      newPath = `${newParent.newPath}.${newObj.id}`;
    }

    await tx
      .update(fsObjects)
      .set({ path: newPath })
      .where(eq(fsObjects.id, newObj.id));

    idMapping.set(obj.id, { newId: newObj.id, newPath, type: obj.type, oldPath: obj.path });
  }

  const mappings = Array.from(idMapping.entries()).map(([oldId, info]) => ({
    oldId,
    oldPath: info.oldPath,
    newId: info.newId,
    newPath: info.newPath,
    type: info.type,
  }));

  return { copiedCount: allObjectsToCopy.length, mappings };
}


/**
 * Move objects to a target folder.
 * Only moves the top-level source objects; their descendants are automatically
 * moved by updating the ltree path prefix.
 * 
 * @param sourceIds - Array of object IDs to move
 * @param targetFolderId - The folder to move into
 * @param userId - The user performing the move
 * @param override - If true, delete conflicting objects before moving
 * @returns The number of objects moved
 */
export async function moveObjects(
  sourceIds: number[],
  targetFolderId: number,
  userId: string,
  override: boolean = false
): Promise<Result<{
  movedCount: number;
  mappings: Array<{ id: number; oldPath: string; newPath: string; type: ObjectType }>;
}, PermissionError | NotFoundError | ValidationError | UnexpectedError>> {
  if (sourceIds.length === 0) {
    return ok({ movedCount: 0, mappings: [] });
  }

  // 1. Check permissions
  const permResult = await checkReqPermission(userId, targetFolderId, "write", "folder");
  if (permResult.isErr()) return err(permResult.error);

  const minPerm = await getMinPermissionForObjects(userId, sourceIds);
  if (!minPerm || PERM_LEVELS[minPerm] < PERM_LEVELS.write) {
    return err({ type: "NO_PERMISSION_ON_DESCENDANTS" });
  }

  // 2. Validate move constraints
  const allIds = [...sourceIds, targetFolderId];
  const rootsMap = await getObjectsRoots(allIds);
  const targetRootId = rootsMap.get(targetFolderId);

  for (const id of sourceIds) {
    if (await isRootFolder(id)) return err({ type: "CANNOT_MOVE_ROOT" });
    if (rootsMap.get(id) !== targetRootId) return err({ type: "CROSS_ROOT_OPERATION" });
  }

  try {
    const [targetFolder] = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(eq(fsObjects.id, targetFolderId));

    if (!targetFolder) {
      return err({ type: "PARENT_NOT_FOUND", parentId: targetFolderId });
    }

    const sourceObjects = await db
      .select({ id: fsObjects.id, path: fsObjects.path, name: fsObjects.name })
      .from(fsObjects)
      .where(inArray(fsObjects.id, sourceIds));

    if (sourceObjects.length === 0) {
      return ok({ movedCount: 0, mappings: [] });
    }

    const conflicts = await checkNameConflicts(sourceObjects.map(o => o.name), targetFolder.path);

    if (conflicts.length > 0 && !override) {
      return err({ type: "NAME_ALREADY_EXISTS", name: conflicts[0].name, parentId: targetFolderId });
    }

    const txResult = await safeTransaction(db, async (tx) => {
      if (conflicts.length > 0 && override) {
        await deleteConflicts(tx, conflicts);
      }

      return ok(await performMove(tx, sourceObjects, targetFolder.path));
    });

    return txResult;

  } catch (error) {
    console.error("Failed to move objects", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

async function performMove(
  tx: Transaction,
  sourceObjects: { id: number; path: string; name: string }[],
  targetFolderPath: string
) {
  const mappings: Array<{ id: number; oldPath: string; newPath: string; type: ObjectType }> = [];

  for (const obj of sourceObjects) {
    const oldPath = obj.path;
    const newPath = buildChildPath(targetFolderPath, obj.id);

    const [objDetails] = await tx
      .select({ type: fsObjects.type })
      .from(fsObjects)
      .where(eq(fsObjects.id, obj.id));

    mappings.push({
      id: obj.id,
      oldPath,
      newPath,
      type: objDetails.type,
    });

    await tx
      .update(fsObjects)
      .set({ path: newPath })
      .where(eq(fsObjects.id, obj.id));

    await tx
      .update(fsObjects)
      .set({
        path: sql`${ltreeConcat(ltreeCast(newPath), subpath(fsObjects.path, nlevel(oldPath)))}`
      })
      .where(
        and(
          isDescendantOf(fsObjects.path, oldPath),
          ne(fsObjects.id, obj.id)
        )
      );
  }

  return { movedCount: sourceObjects.length, mappings };
}

// ============================================================================
// COMBINED DB + S3 OPERATIONS
// These functions coordinate database and S3 storage within transactions.
// If S3 fails, the DB transaction is rolled back. Use these exported functions.
// ============================================================================

// Type for transaction parameter
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// -------------------- INTERNAL DB FUNCTIONS (accept tx) --------------------

/** Internal: Create file record in DB */
async function uploadFileDb(
  tx: Transaction,
  parentId: number,
  fileName: string
): Promise<Result<FSObject, NotFoundError>> {
  const [parent] = await tx
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, parentId));

  if (!parent) return err({ type: "PARENT_NOT_FOUND", parentId });

  const [file] = await tx
    .insert(fsObjects)
    .values({ name: fileName, type: "file", path: "0" })
    .returning();

  const newPath = `${parent.path}.${file.id}`;
  await tx
    .update(fsObjects)
    .set({ path: newPath })
    .where(eq(fsObjects.id, file.id));

  return ok({ ...file, path: newPath });
}

/** Internal: Delete object and descendants from DB, returns file paths */
async function deleteObjectDb(
  tx: Transaction,
  objectPath: string
): Promise<{ path: string; type: string }[]> {
  const filesToDelete = await tx
    .select({ path: fsObjects.path, type: fsObjects.type })
    .from(fsObjects)
    .where(isDescendantOf(fsObjects.path, objectPath));

  await tx.delete(fsObjects).where(isDescendantOf(fsObjects.path, objectPath));

  return filesToDelete;
}

// -------------------- INTERNAL S3 FUNCTIONS --------------------

/** Internal: Upload file content to S3 */
async function uploadFileS3(
  s3Key: string,
  fileContent: Buffer,
  contentType: string
): Promise<void> {
  await uploadToS3(s3Key, fileContent, contentType);
}

/** Internal: Delete files from S3 with concurrency control */
async function deleteFilesS3(
  fileKeys: string[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const queue = new PQueue({ concurrency: S3_CONCURRENCY });

  await queue.addAll(
    fileKeys.map((key) => async () => {
      try {
        await deleteFromS3(key);
        deleted++;
      } catch {
        failed++;
      }
    })
  );

  return { deleted, failed };
}

/** Internal: Copy files in S3 with concurrency control */
async function copyFilesS3(
  mappings: Array<{ oldPath: string; newPath: string }>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  const queue = new PQueue({ concurrency: S3_CONCURRENCY });

  await queue.addAll(
    mappings.map((m) => async () => {
      const oldKey = m.oldPath.replace(/\./g, "/");
      const newKey = m.newPath.replace(/\./g, "/");
      try {
        await copyS3Object(oldKey, newKey);
        success++;
      } catch {
        failed++;
      }
    })
  );

  return { success, failed };
}

/** Internal: Move files in S3 (copy + delete) with concurrency control */
async function moveFilesS3(
  mappings: Array<{ oldPath: string; newPath: string }>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  const queue = new PQueue({ concurrency: S3_CONCURRENCY });

  await queue.addAll(
    mappings.map((m) => async () => {
      const oldKey = m.oldPath.replace(/\./g, "/");
      const newKey = m.newPath.replace(/\./g, "/");
      try {
        await copyS3Object(oldKey, newKey);
        await deleteFromS3(oldKey);
        success++;
      } catch {
        failed++;
      }
    })
  );

  return { success, failed };
}

// -------------------- EXPORTED TRANSACTIONAL WRAPPERS --------------------

type UploadWithS3Result = Result<FSObject, PermissionError | NotFoundError | S3Error | UnexpectedError>;

/**
 * Upload a file with content - creates DB record and uploads to S3 in one transaction.
 * If S3 upload fails, the entire DB transaction is rolled back.
 */
export async function uploadFileWithContent(
  parentId: number,
  fileName: string,
  fileContent: Buffer,
  contentType: string,
  userId: string
): Promise<UploadWithS3Result> {
  // Permission check outside transaction
  const permResult = await checkReqPermission(userId, parentId, "write", "folder");
  if (permResult.isErr()) return err(permResult.error);

  try {
    // Single transaction: DB insert + S3 upload
    return await safeTransaction(db, async (tx) => {
      const dbResult = await uploadFileDb(tx, parentId, fileName);
      if (dbResult.isErr()) return dbResult;

      const fsObject = dbResult.value;
      const s3Key = fsObjectToS3Key(fsObject);

      // S3 upload inside transaction
      const s3Result = await ResultAsync.fromPromise(
        uploadFileS3(s3Key, fileContent, contentType),
        (error) => ({ type: "S3_UPLOAD_FAILED" as const, key: `${parentId}/*`, cause: error })
      );

      // safeTransaction handles Err return by rolling back
      if (s3Result.isErr()) return err(s3Result.error);

      return ok(fsObject);
    });
  } catch (error) {
    // safeTransaction returns Err if callback returns Err or if unexpected error occurs
    // We can just rely on safeTransaction's error return if it matches Result shape.
    // However, safeTransaction returns Promise<Result>.
    // So the try/catch might be redundant if safeTransaction catches everything.
    // But safeTransaction catches "Unexpected database transaction failure".
    // If uploadFileS3 threw (which it shouldn't if wrapped in ResultAsync), safeTransaction would catch it and return Err.
    // So we can simplify this whole block. 
    console.error("Upload transaction failed (unexpected):", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

type DeleteWithS3Result = Result<
  { deletedCount: number; s3DeletedCount: number; s3FailedCount: number },
  PermissionError | NotFoundError | UnexpectedError
>;

/**
 * Delete object with S3 cleanup - removes from DB first, then S3.
 * S3 failures don't roll back DB (DB is source of truth for deletes).
 */
export async function deleteObjectWithS3(
  objectId: number,
  userId: string
): Promise<DeleteWithS3Result> {
  // Get object and check permissions
  const [obj] = await db
    .select({ id: fsObjects.id, path: fsObjects.path, type: fsObjects.type })
    .from(fsObjects)
    .where(eq(fsObjects.id, objectId));

  if (!obj) {
    return err({ type: "OBJECT_NOT_FOUND", objectId });
  }

  const parts = obj.path.split(".");
  const parentId = parts.length > 1 ? parseInt(parts[parts.length - 2]) : null;

  if (!parentId) {
    const permResult = await checkReqPermission(userId, objectId, "admin", "file");
    if (permResult.isErr()) return err(permResult.error);
  } else {
    const permResult = await checkReqPermission(userId, parentId, "write", "folder");
    if (permResult.isErr()) return err(permResult.error);
  }

  try {
    // Delete from DB and get file paths
    const deletedFilesResult = await safeTransaction(db, async (tx) => {
      return ok(await deleteObjectDb(tx, obj.path));
    });

    if (deletedFilesResult.isErr()) return err(deletedFilesResult.error);
    const deletedFiles = deletedFilesResult.value;

    // S3 cleanup (best effort - DB is source of truth)
    const fileKeys = deletedFiles
      .filter((f) => f.type === "file")
      .map((f) => fsObjectToS3Key({ path: f.path, type: f.type as ObjectType }));

    const s3Result = await deleteFilesS3(fileKeys);

    return ok({
      deletedCount: deletedFiles.length,
      s3DeletedCount: s3Result.deleted,
      s3FailedCount: s3Result.failed,
    });
  } catch (error) {
    console.error("Delete failed:", error);
    return err({ type: "UNEXPECTED", cause: error });
  }
}

type CopyWithS3Result = Result<
  { copiedCount: number; s3SuccessCount: number; s3FailCount: number },
  PermissionError | NotFoundError | ValidationError | UnexpectedError
>;

/**
 * Copy objects with S3 - copies in DB, then copies S3 files.
 * S3 failures are reported but don't roll back DB.
 */
export async function copyObjectsWithS3(
  sourceIds: number[],
  targetFolderId: number,
  userId: string,
  override: boolean = false
): Promise<CopyWithS3Result> {
  const dbResult = await copyObjects(sourceIds, targetFolderId, userId, override);

  if (dbResult.isErr()) {
    return err(dbResult.error);
  }

  const { copiedCount, mappings } = dbResult.value;
  const fileMappings = mappings.filter((m) => m.type === "file");

  const s3Result = await copyFilesS3(
    fileMappings.map((m) => ({ oldPath: m.oldPath, newPath: m.newPath }))
  );

  return ok({
    copiedCount,
    s3SuccessCount: s3Result.success,
    s3FailCount: s3Result.failed,
  });
}

type MoveWithS3Result = Result<
  { movedCount: number; s3SuccessCount: number; s3FailCount: number },
  PermissionError | NotFoundError | ValidationError | UnexpectedError
>;

/**
 * Move objects with S3 - moves in DB, then moves S3 files (copy + delete).
 * S3 failures are reported but don't roll back DB.
 */
export async function moveObjectsWithS3(
  sourceIds: number[],
  targetFolderId: number,
  userId: string,
  override: boolean = false
): Promise<MoveWithS3Result> {
  const dbResult = await moveObjects(sourceIds, targetFolderId, userId, override);

  if (dbResult.isErr()) {
    return err(dbResult.error);
  }

  const { movedCount, mappings } = dbResult.value;
  const fileMappings = mappings.filter((m) => m.type === "file");

  const s3Result = await moveFilesS3(
    fileMappings.map((m) => ({ oldPath: m.oldPath, newPath: m.newPath }))
  );

  return ok({
    movedCount,
    s3SuccessCount: s3Result.success,
    s3FailCount: s3Result.failed,
  });
}

