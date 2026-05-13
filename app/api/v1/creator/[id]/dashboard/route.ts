import { NextResponse } from "next/server";
import { getCreatorSnapshotForRequest } from "@/lib/social/creator-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(req: Request, context: RouteContext) {
  const snapshot = await getCreatorSnapshotForRequest(req, context.params.id);
  return NextResponse.json(
    {
      ...snapshot,
      view: "dashboard",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
