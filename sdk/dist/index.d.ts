type FilterOperator = "equal" | "not_equal" | "greater_then" | "greater_then_or_equal" | "less_then" | "less_then_or_equal" | "contained_in_list" | "not_contained_in_list" | "has_all_values" | "has_any_value";
declare class ChatEmbedClient {
    private targetWindow;
    private targetOrigin;
    constructor(options?: {
        targetWindow?: Window;
        targetOrigin?: string;
    });
    setTargetWindow(window: Window): void;
    private postMessage;
    /**
     * Set metadata with required operatorMap and optional display maps for Hebrew/human-readable labels
     * @param key - The root key for this metadata entry
     * @param value - The value (can be primitive or complex object)
     * @param operatorMap - Required map of paths to filter operators
     * @param options - Additional options including display maps
     */
    setMetadata(key: string, value: any, operatorMap: Record<string, FilterOperator>, options?: {
        displayMap?: Record<string, string>;
        valueDisplayMap?: Record<string, string>;
    }): void;
    deleteMetadata(key: string): void;
    clearMetadata(): void;
}

export { ChatEmbedClient };
export type { FilterOperator };
