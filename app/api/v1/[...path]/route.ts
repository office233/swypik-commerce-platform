import { NextResponse } from "next/server";
import { proxyToSocialApi } from "@/lib/social/proxy";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

type RouteContext = {
  params: {
    path: string[];
  };
};

async function fallback(req: Request, socialPath: string) {
  if (req.method === "GET" && socialPath === "/v1/notifications") {
    return NextResponse.json({
      notifications: [],
      unread: 0,
      source: "next-fallback",
    });
  }

  if (req.method === "POST" && socialPath === "/v1/social/follow") {
    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        persisted: false,
        source: "next-fallback",
      },
      { status: 202 }
    );
  }

  if (req.method === "POST" && socialPath === "/v1/checkout") {
    const body = await req.text();
    return fetch(new URL("/api/checkout", req.url), {
      method: "POST",
      headers: req.headers,
      body,
      cache: "no-store",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Go social API is not configured for this endpoint.",
      endpoint: socialPath,
    },
    { status: 503 }
  );
}

async function handle(req: Request, context: RouteContext) {
  const socialPath = `/v1/${context.params.path.join("/")}`;
  const proxied = await proxyToSocialApi(req, socialPath);
  if (proxied) return proxied;
  return fallback(req, socialPath);
}

export async function GET(req: Request, context: RouteContext) {
  return handle(req, context);
}

export async function POST(req: Request, context: RouteContext) {
  return handle(req, context);
}

export async function PUT(req: Request, context: RouteContext) {
  return handle(req, context);
}

export async function PATCH(req: Request, context: RouteContext) {
  return handle(req, context);
}

export async function DELETE(req: Request, context: RouteContext) {
  return handle(req, context);
}
