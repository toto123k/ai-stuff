declare module 'parquetjs-lite' {
    export class ParquetSchema {
        constructor(schema: Record<string, any>);
    }

    export class ParquetWriter {
        static openFile(schema: ParquetSchema, path: string, options?: { compression?: string }): Promise<ParquetWriter>;
        appendRow(row: Record<string, any>): Promise<void>;
        close(): Promise<void>;
    }

    export class ParquetReader {
        static openFile(path: string): Promise<ParquetReader>;
        getRowCount(): number;
        getCursor(): ParquetCursor;
        close(): Promise<void>;
    }

    export interface ParquetCursor {
        next(): Promise<Record<string, any> | null>;
    }

    const parquet: {
        ParquetSchema: typeof ParquetSchema;
        ParquetWriter: typeof ParquetWriter;
        ParquetReader: typeof ParquetReader;
    };

    export default parquet;
}
