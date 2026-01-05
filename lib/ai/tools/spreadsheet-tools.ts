import { tool } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { downloadFromS3, uploadToS3, s3ObjectExists } from "@/lib/s3";
import { getFile, updateFileMetadata } from "@/lib/db/fs-queries";
import type { SpreadsheetSchema, FSObjectMetadata } from "@/lib/db/schema";
import { convertXlsxToParquet, getSheetParquetKey, getDerivedPrefix } from "@/lib/converters/xlsx-to-parquet";
import { runSingleQuery } from "@/lib/converters/parquet-query";
import { fsObjectToS3Key } from "@/lib/s3";

/**
 * Get file info from database and return file object with S3 key
 */
const getFileWithS3Key = async (fileId: number, userId: string) => {
    const result = await getFile(fileId, userId);
    if (result.isErr()) {
        throw new Error(`File not found or access denied: ${result.error.type}`);
    }
    return {
        file: result.value,
        s3Key: fsObjectToS3Key(result.value),
    };
};

/**
 * Get or create Parquet conversion for a spreadsheet.
 * Returns the schema from metadata if cached, otherwise converts and uploads.
 */
const getOrCreateParquetConversion = async (
    fileId: number,
    userId: string
): Promise<SpreadsheetSchema> => {
    const { file, s3Key } = await getFileWithS3Key(fileId, userId);

    // Check if already converted (schema in metadata)
    if (file.metadata?.spreadsheetSchema) {
        // Verify at least one parquet file exists
        const firstSheet = file.metadata.spreadsheetSchema.sheets[0];
        if (firstSheet) {
            const parquetKey = getSheetParquetKey(fileId, firstSheet.tableName);
            if (await s3ObjectExists(parquetKey)) {
                return file.metadata.spreadsheetSchema;
            }
        }
    }

    // Need to convert
    console.log(`Converting spreadsheet ${fileId} to Parquet...`);

    // Download original XLSX
    const xlsxBody = await downloadFromS3(s3Key);
    if (!xlsxBody) {
        throw new Error(`Failed to download Excel file: ${s3Key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of xlsxBody as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    const xlsxBuffer = Buffer.concat(chunks);

    // Convert to Parquet
    const { schema, sheets: parquetBuffers } = await convertXlsxToParquet(xlsxBuffer);

    // Upload parquet files to S3
    for (const [tableName, buffers] of parquetBuffers) {
        // For now, we use single part per sheet
        const parquetKey = getSheetParquetKey(fileId, tableName);
        await uploadToS3(parquetKey, buffers[0], "application/octet-stream");
    }

    // Update file metadata with schema
    const newMetadata: FSObjectMetadata = {
        ...file.metadata,
        spreadsheetSchema: schema,
    };
    await updateFileMetadata(fileId, newMetadata);

    console.log(`Converted spreadsheet ${fileId}: ${schema.sheets.length} sheets`);

    return schema;
};

// Tool parameter schemas
const getSpreadsheetSchemaParams = z.object({
    fileId: z.number().describe("The file ID of the Excel spreadsheet from the library"),
});

const runSpreadsheetQueryParams = z.object({
    fileId: z.number().describe("The file ID of the Excel spreadsheet from the library"),
    query: z.string().describe("The SQL query to run against the spreadsheet data"),
});

export type GetSpreadsheetSchemaParams = z.infer<typeof getSpreadsheetSchemaParams>;
export type RunSpreadsheetQueryParams = z.infer<typeof runSpreadsheetQueryParams>;

// Result types
export interface SpreadsheetSchemaResult {
    success: boolean;
    tables: string[];
    schema: string;
    error?: string;
}

export interface SpreadsheetQueryResult {
    success: boolean;
    columns: string[];
    rows: any[];
    rowCount: number;
    error?: string;
}

/**
 * Tool to get the schema of an Excel spreadsheet
 */
export const getSpreadsheetSchema = tool<GetSpreadsheetSchemaParams, SpreadsheetSchemaResult>({
    description:
        "REQUIRED FIRST STEP: Get the schema of a user's Excel spreadsheet. Call this tool when the user has selected a spreadsheet file and asks ANY question about its data (e.g., 'what are some effects', 'show me X', 'count Y', 'pie chart of Z'). You CANNOT answer spreadsheet questions without calling this tool first. After getting the schema, you MUST call runSpreadsheetQuery to get actual data.",
    inputSchema: getSpreadsheetSchemaParams,
    execute: async ({ fileId }) => {
        try {
            const session = await auth();
            if (!session?.user?.id) {
                return { success: false, tables: [], schema: "", error: "Not authenticated" };
            }

            const spreadsheetSchema = await getOrCreateParquetConversion(fileId, session.user.id);

            // Format schema for display
            const tables = spreadsheetSchema.sheets.map(s => s.tableName);
            const schemaText = spreadsheetSchema.sheets.map(sheet => {
                const cols = sheet.columns.map(c => `${c.name} ${c.type.toUpperCase()}`).join(", ");
                return `CREATE TABLE ${sheet.tableName} (${cols})`;
            }).join(";\n");

            return {
                success: true,
                tables,
                schema: schemaText,
            };
        } catch (error) {
            console.error("Error getting spreadsheet schema:", error);
            return {
                success: false,
                tables: [],
                schema: "",
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    },

    toModelOutput(result) {
        if (!result.success) {
            return {
                type: "content" as const,
                value: [{ type: "text" as const, text: `Error: ${result.error}` }]
            };
        }
        return {
            type: "content" as const,
            value: [{
                type: "text" as const,
                text: `Spreadsheet loaded with ${result.tables.length} table(s): ${result.tables.join(", ")}\n\n${result.schema}\n\nNow query the data to answer the user's question.`
            }]
        };
    }
});

/**
 * Tool to run a SQL query on an Excel spreadsheet
 */
export const runSpreadsheetQuery = tool<RunSpreadsheetQueryParams, SpreadsheetQueryResult>({
    description:
        "REQUIRED SECOND STEP: Run a SQL query on an Excel spreadsheet to get actual data. Call this AFTER getSpreadsheetSchema. Use SELECT statements to retrieve data. The user's spreadsheet data is ONLY accessible through this tool - you cannot answer questions about it without querying.",
    inputSchema: runSpreadsheetQueryParams,
    execute: async ({ fileId, query }) => {
        try {
            const session = await auth();
            if (!session?.user?.id) {
                return { success: false, columns: [], rows: [], rowCount: 0, error: "Not authenticated" };
            }

            const schema = await getOrCreateParquetConversion(fileId, session.user.id);
            const result = await runSingleQuery(fileId, schema, query, 100);

            return {
                success: true,
                columns: result.columns,
                rows: result.rows,
                rowCount: result.rowCount,
            };
        } catch (error) {
            console.error("Error running spreadsheet query:", error);
            return {
                success: false,
                columns: [],
                rows: [],
                rowCount: 0,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    },

    toModelOutput(result) {
        if (!result.success) {
            return {
                type: "content" as const,
                value: [{ type: "text" as const, text: `Query failed: ${result.error}` }]
            };
        }

        // Format data simply for the model to interpret
        const dataPreview = result.rows.slice(0, 20).map(row =>
            result.columns.map(col => `${col}: ${row[col]}`).join(", ")
        ).join("\n");

        const text = `Data (${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}):\n${dataPreview}${result.rowCount > 20 ? '\n...(more rows available)' : ''}\n\nNow answer the user's question naturally based on this data. Be direct and conversational - do not include SQL or technical details.`;

        return {
            type: "content" as const,
            value: [{ type: "text" as const, text }]
        };
    }
});
