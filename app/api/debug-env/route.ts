import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const envKeys = Object.keys(process.env).filter(k => 
    k.includes("STRIPE") || k.includes("DATABASE") || k === "ADMIN_SECRET" || k === "OPENROUTER_API_KEY"
  ).sort();
  
  const envStatus: Record<string, string> = {};
  for (const key of envKeys) {
    const val = process.env[key] || "";
    // Don't expose actual values, just whether they're set
    envStatus[key] = val ? `SET (${val.length} chars, starts with ${val.substring(0, 5)}...)` : "EMPTY";
  }
  
  return NextResponse.json({ 
    env_status: envStatus,
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    total_env_keys: Object.keys(process.env).length,
  });
}
