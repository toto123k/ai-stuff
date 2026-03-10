import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { type BridgeMessage, bridgeMessageSchema } from "@/lib/metadata-schema";
import { chatMetadataAtom } from "@/lib/store/metadata-store";
import { toast } from "sonner";

export function useMetadataBridge() {
    const setMetadataStore = useSetAtom(chatMetadataAtom);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Basic security check: ensure data exists
            if (!event.data || typeof event.data !== "object") return;

            // We are only interested in messages that look like our protocol
            if (!("type" in event.data)) return;

            const result = bridgeMessageSchema.safeParse(event.data);

            if (!result.success) {
                console.warn("Invalid metadata message received:", result.error);
                return;
            }

            const message: BridgeMessage = result.data;

            switch (message.type) {
                case "SET_METADATA":
                    setMetadataStore((prev) => ({
                        ...prev,
                        [message.payload.key]: {
                            value: message.payload.value,
                            operatorMap: message.payload.operatorMap,
                            displayMap: message.payload.displayMap,
                            valueDisplayMap: message.payload.valueDisplayMap,
                            origin: event.origin,
                        },
                    }));
                    break;

                case "DELETE_METADATA":
                    setMetadataStore((prev) => {
                        const next = { ...prev };
                        delete next[message.payload.key];
                        return next;
                    });
                    break;

                case "CLEAR_METADATA":
                    setMetadataStore({});
                    // toast.success("Chat context cleared");
                    break;
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [setMetadataStore]);
}
