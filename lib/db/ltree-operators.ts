import { sql, SQL } from "drizzle-orm";
import { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Type-safe Drizzle operators for PostgreSQL ltree extension.
 * These wrap raw SQL to provide type safety and composability.
 */

// ============================================================================
// LTREE OPERATORS
// ============================================================================

/**
 * Check if path `a` is a descendant of (or equal to) path `b`.
 * SQL: a <@ b
 * 
 * @example isDescendantOf(child.path, parent.path) // child.path <@ parent.path
 */
export const isDescendantOf = (
    descendant: AnyPgColumn | SQL,
    ancestor: AnyPgColumn | SQL | string
): SQL<boolean> => {
    if (typeof ancestor === "string") {
        return sql<boolean>`${descendant} <@ ${ancestor}::ltree`;
    }
    return sql<boolean>`${descendant} <@ ${ancestor}`;
};

/**
 * Check if path `a` is an ancestor of (or equal to) path `b`.
 * SQL: a @> b
 * 
 * @example isAncestorOf(parent.path, child.path) // parent.path @> child.path
 */
export const isAncestorOf = (
    ancestor: AnyPgColumn | SQL,
    descendant: AnyPgColumn | SQL | string
): SQL<boolean> => {
    if (typeof descendant === "string") {
        return sql<boolean>`${ancestor} @> ${descendant}::ltree`;
    }
    return sql<boolean>`${ancestor} @> ${descendant}`;
};

/**
 * Match path against an lquery pattern.
 * SQL: path ~ pattern
 * 
 * @example lqueryMatch(node.path, "root.*{1}") // Direct children of root
 */
export const lqueryMatch = (
    path: AnyPgColumn | SQL,
    pattern: string
): SQL<boolean> => {
    return sql<boolean>`${path} ~ ${pattern}::lquery`;
};

// ============================================================================
// LTREE FUNCTIONS
// ============================================================================

/**
 * Get the depth (number of labels) in a path.
 * SQL: nlevel(path)
 * 
 * @example nlevel(node.path) // Returns depth of node
 */
export const nlevel = (path: AnyPgColumn | SQL | string): SQL<number> => {
    if (typeof path === "string") {
        return sql<number>`nlevel(${path}::ltree)`;
    }
    return sql<number>`nlevel(${path})`;
};

/**
 * Extract a subpath from a path.
 * SQL: subpath(path, offset) or subpath(path, offset, len)
 * 
 * @example subpath(node.path, 1) // Remove first label
 * @example subpath(node.path, 0, 2) // First two labels
 */
export const subpath = (
    path: AnyPgColumn | SQL | string,
    offset: number | SQL<number>,
    len?: number
): SQL<string> => {
    const pathExpr = typeof path === "string" ? sql`${path}::ltree` : path;

    if (len !== undefined) {
        return sql<string>`subpath(${pathExpr}, ${offset}, ${len})`;
    }
    return sql<string>`subpath(${pathExpr}, ${offset})`;
};

/**
 * Concatenate two ltree paths.
 * SQL: a || b
 * 
 * @example ltreeConcat(parent.path, "123") // parent.path || '123'
 */
export const ltreeConcat = (
    a: AnyPgColumn | SQL | string,
    b: AnyPgColumn | SQL | string
): SQL<string> => {
    const aExpr = typeof a === "string" ? sql`${a}::ltree` : a;
    const bExpr = typeof b === "string" ? sql`${b}::ltree` : b;
    return sql<string>`${aExpr} || ${bExpr}`;
};

// ============================================================================
// CAST HELPERS
// ============================================================================

/**
 * Cast a value to ltree type.
 * SQL: value::ltree
 */
export const ltreeCast = (value: string | number | SQL): SQL<string> => {
    return sql<string>`${value}::ltree`;
};

/**
 * Cast a value to lquery type.
 * SQL: value::lquery
 */
export const lqueryCast = (value: string): SQL<string> => {
    return sql<string>`${value}::lquery`;
};

/**
 * Compare paths for equality.
 * SQL: a = b::ltree
 */
export const ltreeEq = (
    a: AnyPgColumn | SQL,
    b: string
): SQL<boolean> => {
    return sql<boolean>`${a} = ${b}::ltree`;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================


/**
 * Get parent ID from a path (second-to-last element).
 * Returns the parent folder's ID by extracting from path.
 */
export const getParentIdFromPath = (path: string): number | null => {
    const parts = path.split(".");
    return parts.length > 1 ? parseInt(parts[parts.length - 2]) : null;
};

/**
 * Build a child path from parent path and new node ID.
 */
export const buildChildPath = (parentPath: string, nodeId: number): string => {
    return `${parentPath}.${nodeId}`;
};
