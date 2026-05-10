import { NextResponse } from "next/server";

export async function GET() {
  const envKeys = Object.keys(process.env).filter(k => 
    k.includes("STRIPE") || k.includes("DATABASE") || k.includes("VERCEL")
  ).sort();
  
  const envStatus: Record<string, string> = {};
  for (const key of envKeys) {
    const val = process.env[key] || "";
    envStatus[key] = val ? `set (${val.length} chars)` : "EMPTY";
  }
  
  return NextResponse.json({ 
    env_status: envStatus,
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
  });
}
