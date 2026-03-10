import { z } from "zod";

export type FilterOperator =
    | "equal"
    | "not_equal"
    | "greater_then"
    | "greater_then_or_equal"
    | "less_then"
    | "less_then_or_equal"
    | "contained_in_list"
    | "not_contained_in_list"
    | "has_all_values"
    | "has_any_value";

// Copied from lib/metadata-schema.ts to ensure standalone no-deps
const setMetadataSchema = z.object({
    type: z.literal("SET_METADATA"),
    payload: z.object({
        key: z.string(),
        value: z.any(),
        operatorMap: z.record(z.enum([
            "equal",
            "not_equal",
            "greater_then",
            "greater_then_or_equal",
            "less_then",
            "less_then_or_equal",
            "contained_in_list",
            "not_contained_in_list",
            "has_all_values",
            "has_any_value",
        ])),
        displayMap: z.record(z.string()).optional(),
        valueDisplayMap: z.record(z.string()).optional(),
    }),
});

const deleteMetadataSchema = z.object({
    type: z.literal("DELETE_METADATA"),
    payload: z.object({
        key: z.string(),
    }),
});

const clearMetadataSchema = z.object({
    type: z.literal("CLEAR_METADATA"),
    payload: z.object({}).optional(),
});

type SetMetadataMessage = z.infer<typeof setMetadataSchema>;
type DeleteMetadataMessage = z.infer<typeof deleteMetadataSchema>;
type ClearMetadataMessage = z.infer<typeof clearMetadataSchema>;

export class ChatEmbedClient {
    private targetWindow: Window | null = null;
    private targetOrigin: string;

    constructor(options: { targetWindow?: Window; targetOrigin?: string } = {}) {
        this.targetWindow = options.targetWindow || null;
        this.targetOrigin = options.targetOrigin || "*";
    }

    public setTargetWindow(window: Window) {
        this.targetWindow = window;
    }

    private postMessage(message: any) {
        if (!this.targetWindow) {
            console.warn("ChatEmbedClient: No target window set.");
            return;
        }
        this.targetWindow.postMessage(message, this.targetOrigin);
    }

    /**
     * Set metadata with required operatorMap and optional display maps for Hebrew/human-readable labels
     * @param key - The root key for this metadata entry
     * @param value - The value (can be primitive or complex object)
     * @param operatorMap - Required map of paths to filter operators
     * @param options - Additional options including display maps
     */
    public setMetadata(
        key: string,
        value: any,
        operatorMap: Record<string, FilterOperator>,
        options?: {
            displayMap?: Record<string, string>;
            valueDisplayMap?: Record<string, string>;
        }
    ) {
        const message: SetMetadataMessage = {
            type: "SET_METADATA",
            payload: {
                key,
                value,
                operatorMap,
                displayMap: options?.displayMap,
                valueDisplayMap: options?.valueDisplayMap
            },
        };

        this.postMessage(message);
    }

    public deleteMetadata(key: string) {
        const message: DeleteMetadataMessage = {
            type: "DELETE_METADATA",
            payload: { key },
        };
        deleteMetadataSchema.parse(message);
        this.postMessage(message);
    }

    public clearMetadata() {
        const message: ClearMetadataMessage = {
            type: "CLEAR_METADATA",
            payload: {},
        };
        clearMetadataSchema.parse(message);
        this.postMessage(message);
    }
}
