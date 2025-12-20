import { auth } from "@/app/(auth)/auth";
import { getPersonalRoot } from "@/lib/db/fs-queries";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const result = await getPersonalRoot(session.user.id);

    return Response.json(result);
  } catch (error) {
    console.error("Personal root error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
