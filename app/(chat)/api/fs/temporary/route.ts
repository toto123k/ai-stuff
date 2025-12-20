import { auth } from "@/app/(auth)/auth";
import { getTemporaryRoot } from "@/lib/db/fs-queries";
import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
  }

  const result = await getTemporaryRoot(session.user.id);
  
  return NextResponse.json(result);
}
