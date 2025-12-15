"use client";

import { useMemo, type ComponentProps } from "react";
import type { RagToolResult } from "@/lib/ai/tools/rag-search";
import { RagProvider } from "./rag-context";
import { RagResultsInline } from "./rag-results-inline";
import { SourceExplorer } from "./source-explorer";
import { computeRankedResults } from "./types";

interface RagDisplayProps extends ComponentProps<"div"> {
    result: RagToolResult;
}

export const RagDisplay = ({ result, ...props }: RagDisplayProps) => {
    const rankedResults = useMemo(
        () => computeRankedResults(result.results),
        [result.results]
    );

    return (
        <RagProvider initialResults={rankedResults}>
            <div {...props} dir="rtl">
                <RagResultsInline />
                <SourceExplorer />
            </div>
        </RagProvider>
    );
};
