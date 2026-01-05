import Database from "duckdb";
import * as util from "util";
import type { SpreadsheetSchema } from "@/lib/db/schema";
import { getSheetParquetKey } from "./xlsx-to-parquet";
import { downloadFromS3 } from "@/lib/s3";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Forbidden SQL keywords (case-insensitive)
const FORBIDDEN_KEYWORDS = [
    'ATTACH', 'COPY', 'CREATE', 'INSERT', 'UPDATE', 'DELETE',
    'DROP', 'ALTER', 'PRAGMA', 'INSTALL', 'LOAD', 'EXPORT',
    'IMPORT', 'TRUNCATE', 'GRANT', 'REVOKE'
];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

interface QueryResult {
    columns: string[];
    rows: any[];
    rowCount: number;
}

/**
 * Validate that query is SELECT-only
 */
const validateQuery = (query: string): void => {
    const upperQuery = query.toUpperCase().trim();

    for (const keyword of FORBIDDEN_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(upperQuery)) {
            throw new Error(`Query contains forbidden keyword: ${keyword}`);
        }
    }

    if (!upperQuery.startsWith('SELECT')) {
        throw new Error('Only SELECT queries are allowed');
    }
};

/**
 * Inject or modify LIMIT clause
 */
const ensureLimit = (query: string, maxRows: number = DEFAULT_LIMIT): string => {
    const upperQuery = query.toUpperCase();

    const limitMatch = upperQuery.match(/\bLIMIT\s+(\d+)/);
    if (limitMatch) {
        const existingLimit = parseInt(limitMatch[1], 10);
        if (existingLimit > maxRows) {
            return query.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`);
        }
        return query;
    }

    const trimmedQuery = query.trim().replace(/;$/, '');
    return `${trimmedQuery} LIMIT ${maxRows}`;
};

/**
 * Download parquet files from S3 to temp directory
 */
const downloadParquetFiles = async (
    fileId: number,
    schema: SpreadsheetSchema,
    tempDir: string
): Promise<Map<string, string>> => {
    const paths = new Map<string, string>();

    for (const sheet of schema.sheets) {
        const s3Key = getSheetParquetKey(fileId, sheet.tableName);
        const localPath = path.join(tempDir, `${sheet.tableName}.parquet`);

        const body = await downloadFromS3(s3Key);
        if (!body) {
            throw new Error(`Failed to download parquet: ${s3Key}`);
        }

        const chunks: Uint8Array[] = [];
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }

        await fs.writeFile(localPath, Buffer.concat(chunks));
        paths.set(sheet.tableName, localPath);
    }

    return paths;
};

/**
 * Execute a single query on spreadsheet data
 */
export const runSingleQuery = async (
    fileId: number,
    schema: SpreadsheetSchema,
    query: string,
    maxRows: number = DEFAULT_LIMIT
): Promise<QueryResult> => {
    // Validate query safety
    validateQuery(query);

    // Ensure limit
    const limitedQuery = ensureLimit(query, Math.min(maxRows, MAX_LIMIT));

    // Create temp directory for parquet files
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'duckdb-'));

    try {
        // Download parquet files
        const parquetPaths = await downloadParquetFiles(fileId, schema, tempDir);

        // Create DuckDB instance (in-memory)
        const db = new Database.Database(':memory:');
        const connection = db.connect();

        // Promisify methods
        const runAsync = util.promisify(connection.run.bind(connection));
        const allAsync = util.promisify(connection.all.bind(connection));

        // Create views for each sheet
        for (const sheet of schema.sheets) {
            const localPath = parquetPaths.get(sheet.tableName);
            if (!localPath) continue;

            const escapedPath = localPath.replace(/\\/g, '/').replace(/'/g, "''");
            const createViewSql = `CREATE VIEW "${sheet.tableName}" AS SELECT * FROM read_parquet('${escapedPath}')`;

            await runAsync(createViewSql);
        }

        // Execute query
        const rawRows = await allAsync(limitedQuery) as any[];

        // Get columns from first row
        const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

        // Convert BigInt to Number (DuckDB returns BigInt for int64 columns)
        const rows = rawRows.map(row => {
            const converted: Record<string, any> = {};
            for (const key of Object.keys(row)) {
                const value = row[key];
                if (typeof value === 'bigint') {
                    // Convert to number if safe, otherwise string
                    converted[key] = Number.isSafeInteger(Number(value))
                        ? Number(value)
                        : String(value);
                } else {
                    converted[key] = value;
                }
            }
            return converted;
        });

        // Close DB
        db.close();

        return {
            columns,
            rows,
            rowCount: rows.length,
        };
    } finally {
        // Cleanup temp files
        try {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                await fs.unlink(path.join(tempDir, file));
            }
            await fs.rmdir(tempDir);
        } catch {
            // Ignore cleanup errors
        }
    }
};
