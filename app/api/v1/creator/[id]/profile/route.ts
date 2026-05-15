import { NextResponse } from "next/server";
import { getCreatorSnapshotForRequest } from "@/lib/social/creator-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  const snapshot = await getCreatorSnapshotForRequest(req, (await context.params).id);
  return NextResponse.json(
    {
      ...snapshot,
      view: "profile",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
