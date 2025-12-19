import "server-only";

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
import { ChatSDKError } from "../errors";
import {
  fsObjects,
  fsRoots,
  userPermissions,
  user,
  type PermType,
  type ObjectType,
  type RootType,
} from "./schema";
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
): Promise<PermType | null> {
  try {
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
      return perms[0].permission;
    }

    return null;
  } catch (error) {
    console.error("Failed to check permissions", error);
    return null;
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
) {
  try {
    return await db.transaction(async (tx) => {
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

      return { ...rootFolder, path: newPath };
    });
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to create root");
  }
}

export async function createFolder(
  parentId: number,
  name: string,
  userId: string
) {
  // Check write permission on parent
  const perm = await getEffectivePermission(userId, parentId);
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  try {
    return await db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, parentId));

      if (!parent) throw new Error("Parent not found");

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

      return { ...folder, path: newPath };
    });
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to create folder");
  }
}

export async function uploadFile(
  parentId: number,
  name: string,
  userId: string
) {
  // Check write permission on parent
  const perm = await getEffectivePermission(userId, parentId);
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  try {
    return await db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, parentId));

      if (!parent) throw new Error("Parent not found");

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

      return { ...file, path: newPath };
    });
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to upload file");
  }
}


export async function getFile(fileId: number, userId: string) {
  const perm = await getEffectivePermission(userId, fileId);
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.read) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  try {
    const [file] = await db
      .select()
      .from(fsObjects)
      .where(eq(fsObjects.id, fileId));
    return file;
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to get file");
  }
}

export async function deleteObject(objectId: number, userId: string) {
  const [obj] = await db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, objectId));

  if (!obj) throw new ChatSDKError("not_found:database", "Object not found");

  const parts = obj.path.split(".");
  const parentId = parts.length > 1 ? parseInt(parts[parts.length - 2]) : null;

  if (!parentId) {
    const perm = await getEffectivePermission(userId, objectId);
    if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.admin) {
      throw new ChatSDKError("forbidden:database", "Insufficient permissions");
    }
  } else {
    const perm = await getEffectivePermission(userId, parentId);
    if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
      throw new ChatSDKError("forbidden:database", "Insufficient permissions");
    }
  }

  try {
    await db.delete(fsObjects).where(isDescendantOf(fsObjects.path, obj.path));
    return true;
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to delete object");
  }
}

export async function updateObject(
  objectId: number,
  updates: { name?: string; parentId?: number },
  userId: string
) {
  const permChecks = [getEffectivePermission(userId, objectId)];
  if (updates.parentId) {
    permChecks.push(getEffectivePermission(userId, updates.parentId));
  }

  const [perm, newParentPerm] = await Promise.all(permChecks);

  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  if (updates.parentId && (!newParentPerm || PERM_LEVELS[newParentPerm] < PERM_LEVELS.write)) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions on new parent");
  }

  try {
    return await db.transaction(async (tx) => {
      if (updates.parentId) {
        const [obj] = await tx.select().from(fsObjects).where(eq(fsObjects.id, objectId));
        const [newParent] = await tx.select().from(fsObjects).where(eq(fsObjects.id, updates.parentId!));

        if (!obj || !newParent) throw new Error("Object or parent not found");

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
    });
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to update object");
  }
}

export async function addPermission(
  targetUserId: string,
  folderId: number,
  permission: PermType,
  actorId: string
) {
  const [actorPerm, targetEffective] = await Promise.all([
    getEffectivePermission(actorId, folderId),
    getEffectivePermission(targetUserId, folderId),
  ]);

  if (!actorPerm || PERM_LEVELS[actorPerm] < PERM_LEVELS.admin) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  if (targetEffective && PERM_LEVELS[targetEffective] >= PERM_LEVELS[permission]) {
    return { message: "User already has equal or higher permission" };
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

    return { success: true };
  } catch (error) {
    throw new ChatSDKError("bad_request:database", "Failed to add permission");
  }
}

export async function getPermissions(objectID: number, userId: string) {
  const perm = await getEffectivePermission(userId, objectID);
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.admin) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

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

    return Array.from(effectivePerms.values());
  } catch (error) {
    console.error("Failed to get permissions", error);
    throw new ChatSDKError("bad_request:database", "Failed to get permissions");
  }
}

export const getEffectivePermissionSelect = (
  userId: string,
  targetTable: typeof fsObjects
) => {
  const permFolder = aliasedTable(fsObjects, "pf");
  const up = aliasedTable(userPermissions, "up");
  const descFolder = aliasedTable(fsObjects, "df");
  const upDesc = aliasedTable(userPermissions, "up_desc");

  const ancestorPermSubquery = db
    .select({ permission: up.permission })
    .from(up)
    .innerJoin(permFolder, eq(up.folderId, permFolder.id))
    .where(
      and(
        eq(up.userId, userId),
        isDescendantOf(targetTable.path, permFolder.path)
      )
    )
    .orderBy(desc(nlevel(permFolder.path)))
    .limit(1);

  const descendantPermSubquery = db
    .select({ permission: sql<PermType>`'read'::perm_type` })
    .from(upDesc)
    .innerJoin(descFolder, eq(upDesc.folderId, descFolder.id))
    .where(
      and(
        eq(upDesc.userId, userId),
        isDescendantOf(descFolder.path, targetTable.path),
        ne(descFolder.id, targetTable.id)
      )
    )
    .limit(1);

  return sql<PermType | null>`(
    SELECT COALESCE(
      (${ancestorPermSubquery}),
      (${descendantPermSubquery})
    )
  )`;
};

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
      level: nlevel(fsObjects.path),
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
 * Copy objects to a target folder.
 * Uses topological ordering (ancestors first) to correctly map parent IDs.
 * 
 * @param sourceIds - Array of object IDs to copy
 * @param targetFolderId - The folder to copy into
 * @param userId - The user performing the copy
 * @returns The number of objects copied
 */
export async function copyObjects(
  sourceIds: number[],
  targetFolderId: number,
  userId: string
): Promise<{ copiedCount: number }> {
  if (sourceIds.length === 0) {
    return { copiedCount: 0 };
  }

  // Check write permission on target folder
  const targetPerm = await getEffectivePermission(userId, targetFolderId);
  if (!targetPerm || PERM_LEVELS[targetPerm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions on target folder");
  }

  // Get roots for all objects (sources + target)
  const allIds = [...sourceIds, targetFolderId];
  const rootsMap = await getObjectsRoots(allIds);
  const targetRootId = rootsMap.get(targetFolderId);

  // Validate: can't copy root folders
  for (const id of sourceIds) {
    if (await isRootFolder(id)) {
      throw new ChatSDKError("bad_request:database", "Cannot copy root folders");
    }
  }

  // Validate: all sources must be in the same root as target
  for (const id of sourceIds) {
    const sourceRootId = rootsMap.get(id);
    if (sourceRootId !== targetRootId) {
      throw new ChatSDKError("bad_request:database", "Cannot copy between different collection roots");
    }
  }

  // Check read permission on all source objects AND their descendants
  const minPerm = await getMinPermissionForObjects(userId, sourceIds);
  if (!minPerm || PERM_LEVELS[minPerm] < PERM_LEVELS.read) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions on source objects or their contents");
  }

  try {
    return await db.transaction(async (tx) => {
      // Get target folder path
      const [targetFolder] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, targetFolderId));

      if (!targetFolder) {
        throw new Error("Target folder not found");
      }

      // Fetch all source objects and their descendants
      // We need to get all objects where path <@ any of the source paths
      const sourceObjects = await tx
        .select({ id: fsObjects.id, path: fsObjects.path })
        .from(fsObjects)
        .where(inArray(fsObjects.id, sourceIds));

      if (sourceObjects.length === 0) {
        return { copiedCount: 0 };
      }

      // Build array of source paths for the descendant query
      const sourcePaths = sourceObjects.map(s => s.path);

      // Fetch all objects to copy (sources + descendants), sorted by path depth
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
        .orderBy(nlevel(fsObjects.path)); // Ancestors first!

      // Track oldId -> { newId, newPath }
      const idMapping = new Map<number, { newId: number; newPath: string }>();

      // Process in depth order
      for (const obj of allObjectsToCopy) {
        // Insert new object with temporary path
        const [newObj] = await tx
          .insert(fsObjects)
          .values({
            name: obj.name,
            type: obj.type,
            path: "0", // Temporary
          })
          .returning({ id: fsObjects.id });

        // Calculate new path
        let newPath: string;

        // Check if this is a top-level source object
        if (sourceIds.includes(obj.id)) {
          // Top-level: goes directly under target folder
          newPath = `${targetFolder.path}.${newObj.id}`;
        } else {
          // Descendant: find old parent and lookup new parent from mapping
          const pathParts = obj.path.split(".");
          const oldParentId = parseInt(pathParts[pathParts.length - 2]);
          const newParent = idMapping.get(oldParentId);

          if (!newParent) {
            throw new Error(`Parent ${oldParentId} not found in mapping - this shouldn't happen`);
          }

          newPath = `${newParent.newPath}.${newObj.id}`;
        }

        // Update path
        await tx
          .update(fsObjects)
          .set({ path: newPath })
          .where(eq(fsObjects.id, newObj.id));

        // Store mapping
        idMapping.set(obj.id, { newId: newObj.id, newPath });
      }

      return { copiedCount: allObjectsToCopy.length };
    });
  } catch (error) {
    console.error("Failed to copy objects", error);
    throw new ChatSDKError("bad_request:database", "Failed to copy objects");
  }
}


/**
 * Move objects to a target folder.
 * Only moves the top-level source objects; their descendants are automatically
 * moved by updating the ltree path prefix.
 * 
 * @param sourceIds - Array of object IDs to move
 * @param targetFolderId - The folder to move into
 * @param userId - The user performing the move
 * @returns The number of objects moved
 */
export async function moveObjects(
  sourceIds: number[],
  targetFolderId: number,
  userId: string
): Promise<{ movedCount: number }> {
  if (sourceIds.length === 0) {
    return { movedCount: 0 };
  }

  // Check write permission on target folder
  const targetPerm = await getEffectivePermission(userId, targetFolderId);
  if (!targetPerm || PERM_LEVELS[targetPerm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions on target folder");
  }

  // Get roots for all objects (sources + target)
  const allIds = [...sourceIds, targetFolderId];
  const rootsMap = await getObjectsRoots(allIds);
  const targetRootId = rootsMap.get(targetFolderId);

  // Validate: can't move root folders
  for (const id of sourceIds) {
    if (await isRootFolder(id)) {
      throw new ChatSDKError("bad_request:database", "Cannot move root folders");
    }
  }

  // Validate: all sources must be in the same root as target
  for (const id of sourceIds) {
    const sourceRootId = rootsMap.get(id);
    if (sourceRootId !== targetRootId) {
      throw new ChatSDKError("bad_request:database", "Cannot move between different collection roots");
    }
  }

  // Check write permission on all source objects AND their descendants
  const minPerm = await getMinPermissionForObjects(userId, sourceIds);
  if (!minPerm || PERM_LEVELS[minPerm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions on source objects or their contents");
  }

  try {
    return await db.transaction(async (tx) => {
      // Get target folder path
      const [targetFolder] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, targetFolderId));

      if (!targetFolder) {
        throw new Error("Target folder not found");
      }

      // Get all source objects
      const sourceObjects = await tx
        .select({
          id: fsObjects.id,
          path: fsObjects.path,
          name: fsObjects.name
        })
        .from(fsObjects)
        .where(inArray(fsObjects.id, sourceIds));

      if (sourceObjects.length === 0) {
        return { movedCount: 0 };
      }

      // Move each source object and its descendants
      for (const obj of sourceObjects) {
        const oldPath = obj.path;
        const newPath = buildChildPath(targetFolder.path, obj.id);

        // Update the source object's path
        await tx
          .update(fsObjects)
          .set({ path: newPath })
          .where(eq(fsObjects.id, obj.id));

        // Update all descendants' paths
        // Replace the old prefix with the new prefix
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

      return { movedCount: sourceObjects.length };
    });
  } catch (error) {
    console.error("Failed to move objects", error);
    throw new ChatSDKError("bad_request:database", "Failed to move objects");
  }
}
