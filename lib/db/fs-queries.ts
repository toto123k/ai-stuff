import "server-only";

import {
  and,
  desc,
  inArray,
  sql,
  aliasedTable,
  eq,
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
  getParentIdFromPath,
  buildChildPath,
} from "./ltree-operators";
import { caseWhen } from "./case-operators";

// Re-using the connection setup (ideally this should be shared)
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

// Helper to resolve permission hierarchy
const PERM_LEVELS: Record<PermType, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

// ============================================================================
// REUSABLE SUBQUERY BUILDERS
// ============================================================================

/**
 * Subquery to get the path of a node by ID.
 * Returns: SELECT path FROM fs_objects WHERE id = nodeId
 */
const getNodePathSubquery = (nodeId: number) => {
  return db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, nodeId));
};

/**
 * Subquery to check if an object belongs to a personal root owned by someone else.
 * Used for determining shared objects.
 * 
 * @param objectPath - The path column of the object to check
 * @param excludeOwnerId - User ID to exclude (the current user)
 */
const isFromOtherPersonalRootSubquery = (
  objectPath: typeof fsObjects.path,
  excludeOwnerId: string
) => {
  const rootObj = aliasedTable(fsObjects, "root_obj");

  return db
    .select({ one: sql<number>`1` })
    .from(fsRoots)
    .innerJoin(rootObj, eq(fsRoots.rootFolderId, rootObj.id))
    .where(
      and(
        isDescendantOf(objectPath, rootObj.path),
        eq(fsRoots.type, "personal"),
        sql`${fsRoots.ownerId} != ${excludeOwnerId}`
      )
    )
    .limit(1);
};

// ============================================================================
// PERMISSION QUERIES
// ============================================================================

export async function getEffectivePermission(
  userId: string,
  nodeId: number
): Promise<PermType | null> {
  try {
    // Alias for the permission folder
    const permFolder = aliasedTable(fsObjects, "permFolder");

    // Subquery to get the node's path
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
          // Check if the node's path is a descendant of the permission folder's path
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
    .where(sql`${fsObjects.path} = ${path}::ltree`);
  return !!node;
}

export async function createCollectionRoot(
  ownerId: string,
  type: RootType
) {
  try {
    return await db.transaction(async (tx) => {
      // 1. Create the root folder object
      const [rootFolder] = await tx
        .insert(fsObjects)
        .values({
          name: "Root",
          type: "folder",
          path: "0", // Temporary path, will update with ID
        })
        .returning();

      // 2. Update path to be just the ID
      const newPath = `${rootFolder.id}`;
      await tx
        .update(fsObjects)
        .set({ path: newPath })
        .where(eq(fsObjects.id, rootFolder.id));

      // 3. Create fsRoots entry
      await tx.insert(fsRoots).values({
        rootFolderId: rootFolder.id,
        ownerId,
        type,
      });

      // 4. Grant admin permission to owner
      await tx.insert(userPermissions).values({
        userId: ownerId,
        folderId: rootFolder.id,
        permission: "admin",
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
      // Get parent path
      const [parent] = await tx
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, parentId));

      if (!parent) throw new Error("Parent not found");

      // Insert folder
      const [folder] = await tx
        .insert(fsObjects)
        .values({
          name,
          type: "folder",
          path: "0", // Temp
        })
        .returning();

      // Update path: parentPath.folderId
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
  // Get object path to find parent
  const [obj] = await db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, objectId));

  if (!obj) throw new ChatSDKError("not_found:database", "Object not found");

  // Parse path to find parent ID
  const parts = obj.path.split(".");
  const parentId = parts.length > 1 ? parseInt(parts[parts.length - 2]) : null;

  if (!parentId) {
    // Root object? Check admin on self.
    const perm = await getEffectivePermission(userId, objectId);
    if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.admin) {
      throw new ChatSDKError("forbidden:database", "Insufficient permissions");
    }
  } else {
    // Check write on parent
    const perm = await getEffectivePermission(userId, parentId);
    if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
      throw new ChatSDKError("forbidden:database", "Insufficient permissions");
    }
  }

  try {
    // Get path first
    const [target] = await db
      .select({ path: fsObjects.path })
      .from(fsObjects)
      .where(eq(fsObjects.id, objectId));

    if (target) {
      // Delete where path is descendant of target.path
      await db.delete(fsObjects).where(isDescendantOf(fsObjects.path, target.path));
    }
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
  // Check write permission on object (to rename) or parent (to move)
  // Simplification: require write on object AND new parent (if moving)

  const perm = await getEffectivePermission(userId, objectId);
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.write) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  if (updates.parentId) {
    // Check write on new parent
    const newParentPerm = await getEffectivePermission(userId, updates.parentId);
    if (!newParentPerm || PERM_LEVELS[newParentPerm] < PERM_LEVELS.write) {
      throw new ChatSDKError("forbidden:database", "Insufficient permissions on new parent");
    }
  }

  try {
    return await db.transaction(async (tx) => {
      if (updates.parentId) {
        // Moving: Need to update path and all children paths
        const [obj] = await tx.select().from(fsObjects).where(eq(fsObjects.id, objectId));
        const [newParent] = await tx.select().from(fsObjects).where(eq(fsObjects.id, updates.parentId!));

        if (!obj || !newParent) throw new Error("Object or parent not found");

        const oldPath = obj.path;
        const newPath = buildChildPath(newParent.path, obj.id);

        // Update self
        await tx.update(fsObjects).set({
          name: updates.name || obj.name,
          path: newPath
        }).where(eq(fsObjects.id, objectId));

        // Update all descendants' paths - replace oldPath prefix with newPath
        await tx
          .update(fsObjects)
          .set({
            path: sql`${ltreeConcat(ltreeCast(newPath), subpath(fsObjects.path, nlevel(oldPath)))}`
          })
          .where(
            and(
              isDescendantOf(fsObjects.path, oldPath),
              sql`${fsObjects.id} != ${objectId}`
            )
          );
      } else if (updates.name) {
        // Just rename
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
  // Actor must be admin on folder
  const actorPerm = await getEffectivePermission(actorId, folderId);
  if (!actorPerm || PERM_LEVELS[actorPerm] < PERM_LEVELS.admin) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  // Check if target user already has higher/equal permission inherited
  const targetEffective = await getEffectivePermission(targetUserId, folderId);
  if (targetEffective && PERM_LEVELS[targetEffective] >= PERM_LEVELS[permission]) {
    // User already has this permission or better.
    // We can either throw or just return success.
    // User said: "check if there isnt any higher permmision ot the parent"
    // I'll return early to avoid redundant DB entries.
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
  // Check admin permission on the folder itself or inherited
  const perm = await getEffectivePermission(userId, objectID);
  console.log(perm)
  if (!perm || PERM_LEVELS[perm] < PERM_LEVELS.admin) {
    throw new ChatSDKError("forbidden:database", "Insufficient permissions");
  }

  try {
    // Get all permissions on this folder and its ancestors in a single query
    const result = await db
      .select({
        userId: userPermissions.userId,
        permission: userPermissions.permission,
        folderId: userPermissions.folderId,
        email: user.email,
        depth: sql<number>`nlevel((
          SELECT path FROM ${fsObjects} WHERE id = ${userPermissions.folderId}
        ))`.as('depth')
      })
      .from(userPermissions)
      .innerJoin(user, eq(userPermissions.userId, user.id))
      .where(
        // Find all permissions where the permission's folder is an ancestor of our target
        sql`EXISTS (
          SELECT 1 FROM ${fsObjects} AS target
          WHERE target.id = ${objectID}
            AND target.path <@ (
              SELECT path FROM ${fsObjects} AS ancestor
              WHERE ancestor.id = ${userPermissions.folderId}
            )
        )`
      );

    // Aggregate to find the highest permission for each user
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

/**
 * Get the effective permission for a user on an object using pure Drizzle query builder.
 * 
 * This is designed to be used in a select statement like:
 * .select({ ..., permission: getEffectivePermissionSelect(userId, targetTable) })
 * 
 * @param userId - User ID to check permissions for
 * @param targetTable - The aliased fsObjects table reference
 */
export const getEffectivePermissionSelect = (
  userId: string,
  targetTable: typeof fsObjects
) => {
  // Aliases for subquery tables
  const permFolder = aliasedTable(fsObjects, "perm_folder");
  const up = aliasedTable(userPermissions, "up_perm");

  // Permission priority order for sorting
  const permissionPriority = caseWhen(eq(up.permission, "admin"), sql<number>`3`)
    .when(eq(up.permission, "write"), sql<number>`2`)
    .when(eq(up.permission, "read"), sql<number>`1`)
    .else(sql<number>`0`);

  // Subquery to get max inherited permission (target path is descendant of permission folder)
  const maxPermSubquery = db
    .select({ permission: up.permission })
    .from(up)
    .innerJoin(permFolder, eq(up.folderId, permFolder.id))
    .where(
      and(
        eq(up.userId, userId),
        isDescendantOf(targetTable.path, permFolder.path)
      )
    )
    .orderBy(desc(permissionPriority))
    .limit(1);

  // Aliases for descendant check
  const descFolder = aliasedTable(fsObjects, "desc_folder");
  const upDesc = aliasedTable(userPermissions, "up_desc");

  // Subquery to check if user has permission on any descendant
  const hasDescendantSubquery = db
    .select({ one: sql<number>`1` })
    .from(upDesc)
    .innerJoin(descFolder, eq(upDesc.folderId, descFolder.id))
    .where(
      and(
        eq(upDesc.userId, userId),
        isDescendantOf(descFolder.path, targetTable.path),
        sql`${descFolder.id} != ${targetTable.id}`
      )
    )
    .limit(1);

  // Combine: if max_perm exists use it, else if has_descendant return 'read', else null
  return sql<PermType | null>`(
    SELECT COALESCE(
      (${maxPermSubquery}),
      CASE WHEN EXISTS (${hasDescendantSubquery}) THEN 'read'::perm_type ELSE NULL END
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
        lqueryMatch(fsObjects.path, `${folder.path}.*`),
        sql`${nlevel(fsObjects.path)} = ${nlevel(folder.path)} + 1`
      )
    )
    .orderBy(desc(fsObjects.type), fsObjects.name);
}

export async function getPersonalRoot(userId: string) {
  const [root] = await db
    .select({ rootFolderId: fsRoots.rootFolderId })
    .from(fsRoots)
    .where(and(eq(fsRoots.ownerId, userId), eq(fsRoots.type, "personal")));

  if (!root) return { objects: [], rootFolderId: null };

  const objects = await getObjects(root.rootFolderId, userId);
  return { objects, rootFolderId: root.rootFolderId };
}

export async function getSharedRoot(userId: string) {
  const objects = await getSharedObjects(userId);
  return { objects, rootFolderId: null }; // No single root for shared items
}

export async function getSharedObjects(userId: string) {
  // Get all objects where the user has explicit permissions
  // and those objects belong to personal roots (not organizational)
  // The root is found by checking which ancestor of the path exists in fsRoots
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
        // Check that one of the object's ancestor paths is a personal root owned by someone else
        sql`EXISTS (${isFromOtherPersonalRootSubquery(fsObjects.path, userId)})`
      )
    )
    .orderBy(desc(fsObjects.type), fsObjects.name);
}

export async function getOrganizationalRootFolders(userId: string) {
  // Get all organizational roots
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

// Tree node type for hierarchical queries
export interface TreeNode {
  id: number;
  name: string;
  type: "file" | "folder";
  path: string;
  createdAt: Date | null;
  permission: PermType | null;
  children: TreeNode[] | null; // null = unloaded (at max depth), [] = loaded but empty
}

/**
 * Get a tree structure of folders and files starting from a folder up to maxDepth levels.
 * SECURITY: Only returns nodes the user has permission to view.
 * 
 * @param startFolderId - The folder to start from
 * @param userId - User ID for permission checking
 * @param maxDepth - Maximum depth to traverse (1 = direct children only)
 * @returns Tree structure with children arrays (null = unloaded, [] = empty folder)
 */
export async function getTreeHierarchy(
  startFolderId: number,
  userId: string,
  maxDepth: number = 2
): Promise<TreeNode | null> {
  // Get the starting folder
  const [startFolder] = await db
    .select({
      id: fsObjects.id,
      name: fsObjects.name,
      type: fsObjects.type,
      path: fsObjects.path,
      createdAt: fsObjects.createdAt,
    })
    .from(fsObjects)
    .where(eq(fsObjects.id, startFolderId));

  if (!startFolder) return null;

  const startLevel = startFolder.path.split(".").length;
  const maxLevel = startLevel + maxDepth;

  // Query all descendants within maxDepth, including the start folder
  const allNodes = await db
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
        // Path is descendant of or equal to start folder
        isDescendantOf(fsObjects.path, startFolder.path),
        // Within max depth
        sql`${nlevel(fsObjects.path)} <= ${maxLevel}`
      )
    )
    .orderBy(fsObjects.path);

  if (allNodes.length === 0) return null;

  // SECURITY: Filter out nodes where user has no permission
  const accessibleNodes = allNodes.filter(node => node.permission !== null);

  if (accessibleNodes.length === 0) return null;

  // Check if user can access the start folder
  const startNodeData = accessibleNodes.find(n => n.id === startFolderId);
  if (!startNodeData) return null; // User can't access the starting folder

  // Build a map for quick lookup - only include accessible nodes
  const nodeMap = new Map<number, TreeNode>();

  // Initialize all accessible nodes with children = null (unloaded by default)
  for (const node of accessibleNodes) {
    nodeMap.set(node.id, {
      id: node.id,
      name: node.name,
      type: node.type as "file" | "folder",
      path: node.path,
      createdAt: node.createdAt,
      permission: node.permission,
      children: node.type === "folder" ? null : null, // Will be set below
    });
  }

  // Build tree structure - only link accessible nodes
  for (const node of accessibleNodes) {
    const pathParts = node.path.split(".");
    const nodeLevel = pathParts.length;

    // Get parent ID from path
    if (pathParts.length > 1) {
      const parentId = parseInt(pathParts[pathParts.length - 2]);
      const parent = nodeMap.get(parentId);

      if (parent && parent.type === "folder") {
        // Initialize children array if not already (means this folder is within depth)
        if (parent.children === null) {
          parent.children = [];
        }
        parent.children.push(nodeMap.get(node.id)!);
      }
    }

    // Mark folders at max depth as having null children (unloaded)
    // Mark folders within depth that have no children in results as empty []
    const treeNode = nodeMap.get(node.id)!;
    if (treeNode.type === "folder") {
      if (nodeLevel >= maxLevel) {
        // At max depth - children are unloaded
        treeNode.children = null;
      } else if (treeNode.children === null) {
        // Within depth but no children found - empty folder
        treeNode.children = [];
      }
    }
  }


  // Return the start folder as root
  return nodeMap.get(startFolderId) || null;
}

/**
 * Get tree hierarchies for all root types using existing business logic.
 * 
 * - Personal: Uses getPersonalRoot, then scans depth from personal root folder
 * - Organizational: Uses getOrganizationalRootFolders (shows all org roots, even without permission)
 *   Then scans depth only for roots where user has permission
 * - Shared: Uses getSharedObjects (already permission-filtered), then scans depth from each
 * 
 * @param userId - User ID
 * @param maxDepth - Maximum depth to scan from each root
 */
export async function getRootsWithHierarchy(
  userId: string,
  maxDepth: number = 3
): Promise<{
  personal: TreeNode | null;
  organizational: TreeNode[];
  shared: TreeNode[];
}> {
  // === PERSONAL ===
  const [personalRoot] = await db
    .select({ rootFolderId: fsRoots.rootFolderId })
    .from(fsRoots)
    .where(and(eq(fsRoots.ownerId, userId), eq(fsRoots.type, "personal")));

  let personal: TreeNode | null = null;
  if (personalRoot?.rootFolderId) {
    personal = await getTreeHierarchy(personalRoot.rootFolderId, userId, maxDepth);
  }

  // === ORGANIZATIONAL ===
  const orgRoots = await getOrganizationalRootFolders(userId);

  // Process sequentially to avoid connection pool exhaustion
  const organizationalResults: (TreeNode | null)[] = [];
  for (const root of orgRoots) {
    if (root.permission) {
      const tree = await getTreeHierarchy(root.id, userId, maxDepth);
      organizationalResults.push(tree);
    } else {
      // No permission - return as-is with children: null (can't load)
      organizationalResults.push({
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

  // === SHARED ===
  const sharedObjects = await getSharedObjects(userId);
  const sharedFolders = sharedObjects.filter(obj => obj.type === "folder");

  // Process sequentially to avoid connection pool exhaustion
  const sharedResults: (TreeNode | null)[] = [];
  for (const folder of sharedFolders) {
    const tree = await getTreeHierarchy(folder.id, userId, maxDepth);
    sharedResults.push(tree);
  }

  return {
    personal,
    organizational: organizationalResults.filter((t): t is TreeNode => t !== null),
    shared: sharedResults.filter((t): t is TreeNode => t !== null),
  };
}
