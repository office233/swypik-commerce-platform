import { NextResponse } from "next/server";
import { createSeller } from "@/lib/db/seller-queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    if (!body.name || !body.email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const seller = await createSeller({
      name: body.name,
      email: body.email,
      status: "pending",
      business_details: body.business_details || {},
    });

    return NextResponse.json(seller, { status: 201 });
  } catch (error) {
    console.error("Seller onboarding error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
