import { Result, err, ok } from "neverthrow";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Helper type to define the database type, adjusting to the specific instance if needed
type DrizzleDB = PostgresJsDatabase<Record<string, never>> | PostgresJsDatabase<any>;

export async function safeTransaction<T extends Result<any, any>>(
    db: DrizzleDB,
    callback: (tx: any) => Promise<T>
): Promise<T> {
    let result: T | undefined;

    try {
        await db.transaction(async (tx) => {
            result = await callback(tx);

            if (result.isErr()) {
                tx.rollback(); // Abort transaction
            }
        });
    } catch (e) {
        // If we captured an Err, return it (this actually handles the rollback "error" thrown by Drizzle)
        if (result && result.isErr()) {
            return result;
        }

        // If it was an unhandled system error (e.g. Postgres connection died)
        return err({ type: "UNEXPECTED", cause: e }) as unknown as T;
    }

    // Should technically be set if transaction succeeded
    return result as T;
}
