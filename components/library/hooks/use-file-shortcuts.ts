import { useEffect, useRef } from "react";
import { useAtom, useStore } from "jotai";
import { fsObjectStatesAtom, selectedIdsAtom } from "@/lib/store/library-store";
import { FSObject, FSObjectActions } from "../types";

export function useFileShortcuts(files: FSObject[], actions: FSObjectActions) {
    const [states, setStates] = useAtom(fsObjectStatesAtom);
    const store = useStore();

    // Use ref to hold current files so we don't re-attach listener on every render
    const filesRef = useRef(files);
    filesRef.current = files;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if inside an input or textarea
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) {
                return;
            }

            // Select All (Ctrl+A)
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault();
                setStates((prev) => {
                    const next = new Map(prev);

                    // Add all current files to selection
                    filesRef.current.forEach(file => {
                        const currentState = next.get(file.id) || new Set();
                        if (!currentState.has("selected")) {
                            const nextState = new Set(currentState);
                            nextState.add("selected");
                            next.set(file.id, nextState);
                        }
                    });

                    return next;
                });
                return;
            }

            // Copy (Ctrl+C) or Cut (Ctrl+X)
            if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "x")) {
                const action = e.key === "c" ? "copy" : "cut";

                // Get current selection imperatively to avoid dependency on selectedIds
                const currentSelectedIds = store.get(selectedIdsAtom);

                // Only proceed if we have a selection
                if (currentSelectedIds.length === 0) return;

                e.preventDefault();

                setStates((prev) => {
                    const next = new Map(prev);

                    // 1. Clear ALL existing copy/cut states globally
                    for (const [id, state] of next.entries()) {
                        if (state.has("copy") || state.has("cut")) {
                            const nextState = new Set(state);
                            nextState.delete("copy");
                            nextState.delete("cut");
                            if (nextState.size === 0) {
                                next.delete(id);
                            } else {
                                next.set(id, nextState);
                            }
                        }
                    }

                    // 2. Apply new action state to currently selected items
                    currentSelectedIds.forEach(id => {
                        const currentState = next.get(id) || new Set();
                        const nextState = new Set(currentState);
                        nextState.add(action);
                        next.set(id, nextState);
                    });

                    return next;
                });
                return;
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.key === "v") {
                e.preventDefault();
                // Paste into current directory (null target)
                actions.onPaste(null);
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [setStates, actions, store]);
}
