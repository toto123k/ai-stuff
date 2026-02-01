import { z } from "zod";

// Display map: key path -> display string (e.g., "user.name" -> "שם משתמש")
export const displayMapSchema = z.record(z.string()).optional();

// Value display map: "path:value" -> display string (e.g., "status:open" -> "פתוח")
export const valueDisplayMapSchema = z.record(z.string()).optional();

export const metadataValueSchema = z.object({
    value: z.any(), // The actual value sent to the LLM
    displayMap: displayMapSchema, // Map of key paths to display strings
    valueDisplayMap: valueDisplayMapSchema, // Map of "path:value" to display strings
    origin: z.string().optional(), // Origin URL of the embedding site
});

export type MetadataValue = z.infer<typeof metadataValueSchema>;

export const metadataStoreSchema = z.record(metadataValueSchema);

export type MetadataStore = z.infer<typeof metadataStoreSchema>;

// Bridge Message Schemas

export const setMetadataSchema = z.object({
    type: z.literal("SET_METADATA"),
    payload: z.object({
        key: z.string(),
        value: z.any(),
        displayMap: displayMapSchema, // Optional display map for nested keys
        valueDisplayMap: valueDisplayMapSchema, // Optional display map for values
    }),
});

export const deleteMetadataSchema = z.object({
    type: z.literal("DELETE_METADATA"),
    payload: z.object({
        key: z.string(),
    }),
});

export const clearMetadataSchema = z.object({
    type: z.literal("CLEAR_METADATA"),
    payload: z.object({}).optional(),
});

export const bridgeMessageSchema = z.discriminatedUnion("type", [
    setMetadataSchema,
    deleteMetadataSchema,
    clearMetadataSchema,
]);

export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;
