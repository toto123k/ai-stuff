import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type { MetadataStore } from "@/lib/metadata-schema";

const storage = createJSONStorage<MetadataStore>(() => sessionStorage);

export const chatMetadataAtom = atomWithStorage<MetadataStore>(
    "chat-metadata",
    {},
    storage
);
