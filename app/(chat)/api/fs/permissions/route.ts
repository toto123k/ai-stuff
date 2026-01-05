import { auth } from "@/app/(auth)/auth";
import { addPermission, getPermissions, updatePermission, removePermission } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

const addPermissionSchema = z.object({
  targetUserId: z.string().uuid(),
  folderId: z.number(),
  permission: z.enum(["read", "write", "admin"]),
});

const updatePermissionSchema = z.object({
  targetUserId: z.string().uuid(),
  folderId: z.number(),
  permission: z.enum(["read", "write", "admin"]),
});

const removePermissionSchema = z.object({
  targetUserId: z.string().uuid(),
  folderId: z.number(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const json = await request.json();
    const parsed = addPermissionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const { targetUserId, folderId, permission } = parsed.data;

    const result = await addPermission(targetUserId, folderId, permission, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("POST permission handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId" }, { status: StatusCodes.BAD_REQUEST });
  }

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const result = await getPermissions(parseInt(folderId), session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("GET permissions handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const json = await request.json();
    const parsed = updatePermissionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const { targetUserId, folderId, permission } = parsed.data;

    const result = await updatePermission(targetUserId, folderId, permission, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("PUT permission handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const json = await request.json();
    const parsed = removePermissionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const { targetUserId, folderId } = parsed.data;

    const result = await removePermission(targetUserId, folderId, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("DELETE permission handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
