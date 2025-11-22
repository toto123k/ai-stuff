"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import { LibraryHeader } from "./library/library-header";
import { UploadProgress } from "./library/upload-progress";
import { LibraryDialogs } from "./library/library-dialogs";
import { LibraryContent } from "./library/library-content";
import { useLibraryNavigation } from "./library/hooks/use-library-navigation";

export function LibraryView({ userId }: { userId: string }) {
  // We only need navigation hooks here for the header
  const {
    activeRootType,
    breadcrumbs,
    handleRootTypeChange,
    handleBreadcrumbClick,
  } = useLibraryNavigation();

  return (
    <DirectionProvider dir="rtl">
      <div className="flex flex-col h-full bg-background text-foreground" dir="rtl">
        <LibraryHeader
          activeRootType={activeRootType}
          onRootTypeChange={handleRootTypeChange}
          breadcrumbs={breadcrumbs}
          onBreadcrumbClick={handleBreadcrumbClick}
        />

        <LibraryContent />
        <LibraryDialogs />
        <UploadProgress />
      </div>
    </DirectionProvider>
  );
}