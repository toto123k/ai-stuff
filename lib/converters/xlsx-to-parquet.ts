import * as XLSX from "xlsx";
import Database from "duckdb";
import * as util from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { SpreadsheetSchema, SpreadsheetSheetSchema, SpreadsheetColumnSchema } from "@/lib/db/schema";

// Compression settings
const COMPRESSION_CODEC = 'zstd';
const COMPRESSION_LEVEL = 3;
const TARGET_PART_SIZE_MB = 128;
const MIN_PART_SIZE_MB = 64;
const MAX_PART_SIZE_MB = 256;

/**
 * Sanitize a name for use as SQL identifier
 */
const sanitizeName = (name: string, index: number): string => {
    if (!name || name.trim() === "") {
        return `col_${index + 1}`;
    }

    let sanitized = String(name)
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^[0-9]/, "_$&")
        .toLowerCase();

    if (!sanitized || sanitized === "_") {
        return `col_${index + 1}`;
    }

    return sanitized;
};

/**
 * De-duplicate column names
 */
const deduplicateColumnNames = (names: string[]): string[] => {
    const seen = new Map<string, number>();
    return names.map((name) => {
        const count = seen.get(name) || 0;
        seen.set(name, count + 1);
        return count === 0 ? name : `${name}_${count + 1}`;
    });
};

/**
 * Infer column type from sample values  
 */
type ColumnType = 'string' | 'int64' | 'float64' | 'boolean' | 'timestamp';

const inferColumnType = (values: any[]): ColumnType => {
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== "");
    if (nonNull.length === 0) return 'string';

    // Only detect actual boolean values or explicit string true/false
    const allBoolean = nonNull.every(v =>
        typeof v === 'boolean' || v === 'true' || v === 'false'
    );
    if (allBoolean) return 'boolean';

    const allInt = nonNull.every(v => {
        if (typeof v === 'number') return Number.isInteger(v);
        const num = parseInt(String(v), 10);
        return !isNaN(num) && String(num) === String(v).trim();
    });
    if (allInt) return 'int64';

    const allFloat = nonNull.every(v => {
        if (typeof v === 'number') return true;
        const str = String(v).trim();
        // Must match a complete number (int or float), not just start with digits
        if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) return false;
        const num = parseFloat(str);
        return !isNaN(num) && isFinite(num);
    });
    if (allFloat) return 'float64';

    const allDate = nonNull.every(v => {
        if (v instanceof Date) return true;
        const date = new Date(v);
        return !isNaN(date.getTime()) && String(v).length > 4;
    });
    if (allDate) return 'timestamp';

    return 'string';
};

/**
 * Map our type to DuckDB type
 */
const toDuckDBType = (type: ColumnType): string => {
    switch (type) {
        case 'int64': return 'BIGINT';
        case 'float64': return 'DOUBLE';
        case 'boolean': return 'BOOLEAN';
        case 'timestamp': return 'TIMESTAMP';
        default: return 'VARCHAR';
    }
};

/**
 * Convert value for CSV export (DuckDB will import it)
 */
const convertValue = (value: any, type: ColumnType): string | null => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    switch (type) {
        case 'int64':
            const intVal = parseInt(String(value), 10);
            return isNaN(intVal) ? null : String(intVal);
        case 'float64':
            const floatVal = parseFloat(String(value));
            return isNaN(floatVal) ? null : String(floatVal);
        case 'boolean':
            if (typeof value === 'boolean') return value ? 'true' : 'false';
            return (value === 'true' || value === 1) ? 'true' : 'false';
        case 'timestamp':
            const date = value instanceof Date ? value : new Date(value);
            return isNaN(date.getTime()) ? null : date.toISOString();
        default:
            return String(value);
    }
};

interface ConversionResult {
    schema: SpreadsheetSchema;
    sheets: Map<string, Buffer[]>; // tableName -> parquet buffers (multiple parts possible)
}

/**
 * Convert an Excel buffer to Parquet files using DuckDB with ZSTD compression
 */
export const convertXlsxToParquet = async (
    xlsxBuffer: Buffer,
    sampleSize = 1000
): Promise<ConversionResult> => {
    const startTime = Date.now();
    const workbook = XLSX.read(xlsxBuffer, { type: "buffer" });

    if (workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in Excel file");
    }

    const sheets: SpreadsheetSheetSchema[] = [];
    const parquetBuffers = new Map<string, Buffer[]>();
    let totalBytes = 0;

    // Create temp directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xlsx-parquet-'));

    try {
        for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex++) {
            const sheetName = workbook.SheetNames[sheetIndex];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            if (!jsonData || jsonData.length < 2) {
                console.log(`[Parquet] Skipping sheet "${sheetName}": not enough rows`);
                continue;
            }

            const headerRow = jsonData[0] || [];
            const dataRows = jsonData.slice(1).filter(row => row && row.length > 0);

            if (headerRow.length === 0 || dataRows.length === 0) {
                console.log(`[Parquet] Skipping sheet "${sheetName}": no header or no data`);
                continue;
            }

            const rawNames = headerRow.map((h, i) => sanitizeName(String(h ?? ""), i));
            const columnNames = deduplicateColumnNames(rawNames);

            if (columnNames.length === 0) {
                console.log(`[Parquet] Skipping sheet "${sheetName}": no columns`);
                continue;
            }

            // Infer types
            const sampleRows = dataRows.slice(0, sampleSize);
            const columnTypes: ColumnType[] = columnNames.map((_, colIndex) => {
                const sampleValues = sampleRows.map(row => row[colIndex]);
                return inferColumnType(sampleValues);
            });

            const columns: SpreadsheetColumnSchema[] = columnNames.map((name, i) => ({
                originalName: String(headerRow[i] ?? ""),
                name,
                type: columnTypes[i],
                nullable: true,
            }));

            const tableName = sanitizeName(sheetName, sheetIndex);
            console.log(`[Parquet] Processing "${sheetName}" → ${tableName}: ${columnNames.length} cols, ${dataRows.length} rows`);

            // Create DuckDB and insert data
            const db = new Database.Database(':memory:');
            const connection = db.connect();
            const runAsync = util.promisify(connection.run.bind(connection));

            // Create table with proper types
            const columnDefs = columns.map(c => `"${c.name}" ${toDuckDBType(c.type)}`).join(', ');
            await runAsync(`CREATE TABLE data (${columnDefs})`);

            // Insert data in batches
            const BATCH_SIZE = 10000;
            for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
                const batch = dataRows.slice(i, i + BATCH_SIZE);
                const values = batch.map(row => {
                    const vals = columns.map((col, idx) => {
                        const val = convertValue(row[idx], col.type);
                        if (val === null) return 'NULL';
                        if (col.type === 'string') return `'${val.replace(/'/g, "''")}'`;
                        return val;
                    });
                    return `(${vals.join(', ')})`;
                }).join(',\n');

                if (values) {
                    await runAsync(`INSERT INTO data VALUES ${values}`);
                }
            }

            // Export to Parquet with ZSTD compression
            const parquetPath = path.join(tempDir, `${tableName}.parquet`);
            const escapedPath = parquetPath.replace(/\\/g, '/');

            await runAsync(`COPY data TO '${escapedPath}' (FORMAT PARQUET, CODEC 'ZSTD', COMPRESSION_LEVEL ${COMPRESSION_LEVEL})`);

            db.close();

            // Read the parquet file
            const parquetBuffer = await fs.readFile(parquetPath);
            const sheetBytes = parquetBuffer.length;
            totalBytes += sheetBytes;

            console.log(`[Parquet] "${tableName}": ${(sheetBytes / 1024 / 1024).toFixed(2)} MB, ZSTD level ${COMPRESSION_LEVEL}`);

            parquetBuffers.set(tableName, [parquetBuffer]);

            sheets.push({
                originalName: sheetName,
                tableName,
                rowCount: dataRows.length,
                columns,
                partCount: 1,
                totalBytes: sheetBytes,
            });
        }
    } finally {
        // Cleanup temp directory
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

    if (sheets.length === 0) {
        throw new Error("No valid sheets found in Excel file");
    }

    const conversionTimeMs = Date.now() - startTime;
    console.log(`[Parquet] Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB in ${conversionTimeMs}ms`);

    const schema: SpreadsheetSchema = {
        version: 1,
        convertedAt: new Date().toISOString(),
        compression: 'zstd',
        compressionLevel: COMPRESSION_LEVEL,
        totalBytes,
        conversionTimeMs,
        sheets,
    };

    return { schema, sheets: parquetBuffers };
};

/**
 * Get derived parquet S3 prefix for a file
 */
export const getDerivedPrefix = (fileId: number): string => {
    return `derived/${fileId}`;
};

/**
 * Get the S3 key for a sheet's parquet file
 */
export const getSheetParquetKey = (fileId: number, tableName: string): string => {
    return `${getDerivedPrefix(fileId)}/${tableName}.parquet`;
};
