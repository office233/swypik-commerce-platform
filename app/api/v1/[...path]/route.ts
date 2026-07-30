import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { proxyToSocialApi } from "@/lib/social/proxy";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function fallback(req: Request, socialPath: string) {
  if (req.method === "GET" && socialPath === "/v1/notifications") {
    return NextResponse.json({
      notifications: [],
      unread: 0,
      source: "next-fallback",
    });
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
  const { path } = await context.params;
  const socialPath = `/v1/${path.join("/")}`;
  if (req.method === "POST" && socialPath === "/v1/checkout") {
    return fallback(req, socialPath);
  }
  const proxied = await proxyToSocialApi(req, socialPath);
  if (proxied) return proxied;
  return fallback(req, socialPath);
}

async function GET_impl(req: Request, context: RouteContext) {
  return handle(req, context);
}

async function POST_impl(req: Request, context: RouteContext) {
  return handle(req, context);
}

async function PUT_impl(req: Request, context: RouteContext) {
  return handle(req, context);
}

async function PATCH_impl(req: Request, context: RouteContext) {
  return handle(req, context);
}

async function DELETE_impl(req: Request, context: RouteContext) {
  return handle(req, context);
}

export const GET = withErrorHandling(GET_impl);
export const POST = withErrorHandling(POST_impl);
export const PUT = withErrorHandling(PUT_impl);
export const PATCH = withErrorHandling(PATCH_impl);
export const DELETE = withErrorHandling(DELETE_impl);
