/**
 * Adult access state for the current user.
 * GET — { verified: bool, blockedReason, expiresAt, creatorApproved }
 */

import { NextResponse } from "next/server";
import { getAdultAccess } from "@/lib/adult/gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdultAccess();
  if (!access.ok && access.reason === "unauthenticated") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!access.ok) {
    return NextResponse.json(
      {
        verified: false,
        reason: access.reason,
        verifyUrl: "/adult/verify",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      verified: true,
      creatorApproved: access.creatorApproved,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
