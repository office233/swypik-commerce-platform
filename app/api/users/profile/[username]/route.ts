import { NextResponse } from "next/server";
import { getPublicUserProfile } from "@/lib/social/user-profile";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { username } = await params;
    const viewerUserId = await getCurrentViewerUserId();
    const profile = await getPublicUserProfile(username, { viewerUserId });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[User Profile API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to load user profile" },
      { status: 500 }
    );
  }
}

async function getCurrentViewerUserId() {
  return getOptionalSocialUserId();
}
