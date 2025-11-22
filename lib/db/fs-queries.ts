import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  sql,
  aliasedTable,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

// Re-using the connection setup (ideally this should be shared)
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

// Helper to resolve permission hierarchy
const PERM_LEVELS: Record<PermType, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

export async function getEffectivePermission(
  userId: string,
  nodeId: number
): Promise<PermType | null> {
  try {
    const perms = await db
      .select({
        permission: userPermissions.permission,
      })
      .from(userPermissions)
      .innerJoin(
        fsObjects,
        eq(fsObjects.id, userPermissions.folderId)
      )
      .where(
        and(
          eq(userPermissions.userId, userId),
          // FIXED: Check if the node's path is a descendant of the permission folder's path
          sql`(
            SELECT path FROM ${fsObjects} WHERE id = ${nodeId}
          ) <@ ${fsObjects.path}`
        )
      )
      .orderBy(sql`nlevel(${fsObjects.path}) DESC`)
      .limit(1);


    if (perms.length > 0) {
      return perms[0].permission;
    }

    return null
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
    // Delete object and all descendants (cascade via FK usually handles this if set, 
    // but here we might need to delete by path for safety or if FK cascade isn't set on self-ref)
    // Actually, we should use the path to delete subtree.

    // Get path first
    const [target] = await db.select({ path: fsObjects.path }).from(fsObjects).where(eq(fsObjects.id, objectId));

    if (target) {
      // Delete where path is descendant of target.path
      // path <@ 'target.path'
      await db.delete(fsObjects).where(sql`${fsObjects.path} <@ ${target.path}::ltree`);
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
        const newPath = `${newParent.path}.${obj.id}`;

        // Update self
        await tx.update(fsObjects).set({
          name: updates.name || obj.name,
          path: newPath
        }).where(eq(fsObjects.id, objectId));

        // Update all descendants' paths
        // Replace oldPath prefix with newPath prefix
        // SQL: update fs_objects set path = newPath || subpath(path, nlevel(oldPath)) where path <@ oldPath
        await tx.execute(sql`
          UPDATE fs_objects 
          SET path = ${newPath}::ltree || subpath(path, nlevel(${oldPath}::ltree))
          WHERE path <@ ${oldPath}::ltree AND id != ${objectId}
        `);
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

export function getPermissionSql(userId: string, aliasName: string) {
  // Returns the highest permission level ('read', 'write', 'admin') or null
  // Logic:
  // 1. Check for inherited or direct permission: alias.path <@ p.path
  //    If found, take the MAX permission (admin > write > read)
  // 2. If no inherited permission, check for descendant permission: p.path <@ alias.path
  //    If found, return 'read' (visibility only)

  return sql<PermType | null>`(
    SELECT 
      CASE 
        WHEN max_perm IS NOT NULL THEN max_perm
        WHEN has_descendant THEN 'read'::perm_type
        ELSE NULL
      END
    FROM (
      SELECT 
        (
          SELECT permission 
          FROM ${userPermissions} up
          JOIN ${fsObjects} p ON up.folder_id = p.id
          WHERE up.user_id = ${userId}
          AND ${sql.raw(`"${aliasName}".path`)} <@ p.path
          ORDER BY CASE permission 
            WHEN 'admin' THEN 3 
            WHEN 'write' THEN 2 
            WHEN 'read' THEN 1 
          END DESC
          LIMIT 1
        ) as max_perm,
        EXISTS (
          SELECT 1 
          FROM ${userPermissions} up
          JOIN ${fsObjects} p ON up.folder_id = p.id
          WHERE up.user_id = ${userId}
          AND p.path <@ ${sql.raw(`"${aliasName}".path`)}
          AND p.id != ${sql.raw(`"${aliasName}".id`)} -- Exclude self (already covered by max_perm check if direct)
        ) as has_descendant
    ) as checks
  )`;
}

export async function getObjects(folderId: number, userId: string) {
  const [folder] = await db
    .select({ path: fsObjects.path })
    .from(fsObjects)
    .where(eq(fsObjects.id, folderId));

  if (!folder) return [];

  const f = aliasedTable(fsObjects, "f");

  return db
    .select({
      id: f.id,
      name: f.name,
      type: f.type,
      path: f.path,
      createdAt: f.createdAt,
      permission: getPermissionSql(userId, "f"),
    })
    .from(f)
    .where(
      and(
        sql`${f.path} <@ ${folder.path}::ltree`,
        sql`${f.path} ~ ${`${folder.path}.*`}::lquery`,
        sql`nlevel(${f.path}) = nlevel(${folder.path}::ltree) + 1`
      )
    )
    .orderBy(desc(f.type), f.name);
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
        // Check that the root of this object is a personal root
        sql`EXISTS (
          SELECT 1 FROM ${fsRoots}
          WHERE ${fsRoots.rootFolderId} = split_part(${fsObjects.path}::text, '.', 1)::integer
            AND ${fsRoots.type} = 'personal'
            AND ${fsRoots.ownerId} != ${userId}
        )`
      )
    )
    .orderBy(desc(fsObjects.type), fsObjects.name);
}

export async function getOrganizationalRootFolders(userId: string) {
  const f = aliasedTable(fsObjects, "f");

  // Get all organizational roots
  const orgRoots = await db
    .select({
      id: f.id,
      name: f.name,
      type: f.type,
      path: f.path,
      createdAt: f.createdAt,
      permission: getPermissionSql(userId, "f"),
    })
    .from(fsRoots)
    .innerJoin(f, eq(fsRoots.rootFolderId, f.id))
    .where(eq(fsRoots.type, "organizational"));

  return orgRoots;
}
