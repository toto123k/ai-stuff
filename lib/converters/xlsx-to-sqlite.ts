import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import { generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";

// Schema for LLM-generated table definitions
const columnSchema = z.object({
    name: z.string().describe("Column name, sanitized for SQLite (alphanumeric + underscores)"),
    type: z.enum(["TEXT", "INTEGER", "REAL", "BLOB"]).describe("SQLite type inferred from data"),
    nullable: z.boolean().describe("Whether this column can be NULL"),
});

const tableSchema = z.object({
    tableName: z.string().describe("Table name, sanitized for SQLite"),
    columns: z.array(columnSchema).describe("Columns in the table"),
});

const schemaGenerationSchema = z.object({
    tables: z.array(tableSchema).describe("All tables to create in the SQLite database"),
});

export type GeneratedSchema = z.infer<typeof schemaGenerationSchema>;

interface SheetSample {
    sheetName: string;
    headers: string[];
    sampleRows: any[][];
}

/**
 * Extract sample data from an Excel workbook for schema inference
 */
const extractSamples = (workbook: XLSX.WorkBook, maxRows = 5): SheetSample[] => {
    const samples: SheetSample[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        if (!jsonData || jsonData.length === 0) continue;

        const headers = jsonData[0]?.map((h: any) => String(h ?? "column")) || [];
        const sampleRows = jsonData.slice(1, 1 + maxRows);

        samples.push({ sheetName, headers, sampleRows });
    }

    return samples;
};

/**
 * Generate SQLite schema using LLM with structured output
 */
const generateSchemaWithLLM = async (samples: SheetSample[]): Promise<GeneratedSchema> => {
    const prompt = `You are a database schema expert. Analyze these Excel sheet samples and generate an optimal SQLite schema.

For each sheet, create a table with appropriate column types:
- Use INTEGER for whole numbers, IDs, counts
- Use REAL for decimals, currency, percentages
- Use TEXT for strings, dates, mixed content
- Sanitize names: replace spaces/special chars with underscores, ensure valid SQLite identifiers

Sheets data:
${JSON.stringify(samples, null, 2)}

Generate the schema structure.`;

    try {
        const { object } = await generateObject({
            model: myProvider.languageModel("chat-model"),
            schema: schemaGenerationSchema,
            prompt,
        });

        return object;
    } catch (error) {
        console.error("LLM schema generation failed, using fallback:", error);
        // Fallback: all TEXT columns
        return {
            tables: samples.map((sample) => ({
                tableName: sanitizeName(sample.sheetName),
                columns: sample.headers.map((h) => ({
                    name: sanitizeName(h),
                    type: "TEXT" as const,
                    nullable: true,
                })),
            })),
        };
    }
};

/**
 * Sanitize a name for use as SQLite identifier
 */
const sanitizeName = (name: string): string => {
    let sanitized = String(name)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^[0-9]/, "_$&"); // Prefix with _ if starts with number

    if (!sanitized || sanitized === "_") {
        sanitized = "column";
    }

    return sanitized;
};

/**
 * Convert an Excel buffer to a SQLite database buffer
 * Uses in-memory SQLite - no temp files needed
 */
export const convertXlsxToSqlite = async (
    xlsxBuffer: Buffer,
    options?: { inferSchema?: boolean }
): Promise<Buffer> => {
    const inferSchema = options?.inferSchema ?? true;

    // Parse Excel
    const workbook = XLSX.read(xlsxBuffer, { type: "buffer" });
    const samples = extractSamples(workbook);

    if (samples.length === 0) {
        throw new Error("No valid sheets found in Excel file");
    }

    // Generate schema
    let schema: GeneratedSchema;
    if (inferSchema) {
        schema = await generateSchemaWithLLM(samples);
    } else {
        // Fallback schema: all TEXT
        schema = {
            tables: samples.map((sample) => ({
                tableName: sanitizeName(sample.sheetName),
                columns: sample.headers.map((h) => ({
                    name: sanitizeName(h),
                    type: "TEXT" as const,
                    nullable: true,
                })),
            })),
        };
    }

    // Create in-memory SQLite database
    const db = new Database(":memory:");

    try {
        // Create tables and insert data
        for (let i = 0; i < schema.tables.length; i++) {
            const tableInfo = schema.tables[i];
            const sample = samples[i];

            if (!tableInfo || !sample) continue;

            // Get full data for this sheet
            const sheet = workbook.Sheets[sample.sheetName];
            const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            const dataRows = fullData.slice(1); // Skip header

            // Create table - always nullable since Excel data often has empty cells
            const columnDefs = tableInfo.columns
                .map((col) => `"${col.name}" ${col.type}`)
                .join(", ");

            const createStmt = `CREATE TABLE IF NOT EXISTS "${tableInfo.tableName}" (${columnDefs})`;

            try {
                db.exec(createStmt);
            } catch (ddlError) {
                console.error(`Failed to create table ${tableInfo.tableName}:`, ddlError);
                // Fallback: create with all TEXT columns
                const fallbackDefs = tableInfo.columns.map((col) => `"${col.name}" TEXT`).join(", ");
                db.exec(`CREATE TABLE IF NOT EXISTS "${tableInfo.tableName}" (${fallbackDefs})`);
            }

            // Insert data
            if (dataRows.length > 0) {
                const placeholders = tableInfo.columns.map(() => "?").join(", ");
                const insertStmt = db.prepare(
                    `INSERT INTO "${tableInfo.tableName}" VALUES (${placeholders})`
                );

                const insertMany = db.transaction((rows: any[][]) => {
                    for (const row of rows) {
                        const cleanRow = tableInfo.columns.map((col, idx) => {
                            const val = row[idx];
                            if (val === undefined || val === null) return null;
                            // Convert based on expected type
                            if (col.type === "INTEGER") {
                                const num = parseInt(String(val), 10);
                                return isNaN(num) ? null : num;
                            }
                            if (col.type === "REAL") {
                                const num = parseFloat(String(val));
                                return isNaN(num) ? null : num;
                            }
                            return String(val);
                        });
                        insertStmt.run(cleanRow);
                    }
                });

                insertMany(dataRows);
            }
        }

        // Serialize to buffer (no temp files!)
        const sqliteBuffer = db.serialize();
        return Buffer.from(sqliteBuffer);
    } finally {
        db.close();
    }
};

/**
 * Get table info from a SQLite database buffer
 * Uses in-memory deserialization - no temp files
 */
export const getSqliteTableInfo = (sqliteBuffer: Buffer): { tables: string[]; schema: string } => {
    // Deserialize buffer to in-memory database
    const db = new Database(sqliteBuffer, { readonly: true });

    try {
        // Get all tables
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .all() as { name: string }[];

        // Get schema for each table
        const schemaLines: string[] = [];
        for (const { name } of tables) {
            const tableInfo = db.prepare(`PRAGMA table_info("${name}")`).all() as {
                name: string;
                type: string;
                notnull: number;
            }[];
            const cols = tableInfo.map((c) => `${c.name} ${c.type}${c.notnull ? " NOT NULL" : ""}`);
            schemaLines.push(`CREATE TABLE ${name} (${cols.join(", ")})`);
        }

        return {
            tables: tables.map((t) => t.name),
            schema: schemaLines.join(";\n"),
        };
    } finally {
        db.close();
    }
};

/**
 * Run a SQL query on a SQLite database buffer
 * Uses in-memory deserialization - no temp files
 */
export const runSqliteQuery = (
    sqliteBuffer: Buffer,
    query: string
): { columns: string[]; rows: any[] } => {
    // Deserialize buffer to in-memory database
    const db = new Database(sqliteBuffer, { readonly: true });

    try {
        const stmt = db.prepare(query);
        const rows = stmt.all();

        // Extract column names
        const columns = stmt.columns().map((c) => c.name);

        return { columns, rows };
    } finally {
        db.close();
    }
};
