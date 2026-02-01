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
     * Set metadata with optional display maps for Hebrew/human-readable labels
     * @param key - The root key for this metadata entry
     * @param value - The value (can be primitive or complex object)
     * @param displayMap - Optional map of paths to display labels, e.g. {"user.name": "שם משתמש"}
     * @param valueDisplayMap - Optional map of "path:value" to display values, e.g. {"status:open": "פתוח"}
     */
    setMetadata(key: string, value: any, displayMap?: Record<string, string>, valueDisplayMap?: Record<string, string>): void;
    deleteMetadata(key: string): void;
    clearMetadata(): void;
}

export { ChatEmbedClient };
