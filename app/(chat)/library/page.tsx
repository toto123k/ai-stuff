import { auth } from "@/app/(auth)/auth";
import { LibraryView } from "@/components/library-view";
import { redirect } from "next/navigation";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col h-full w-full">
      <LibraryView userId={session.user.id} />
    </div>
  );
}
