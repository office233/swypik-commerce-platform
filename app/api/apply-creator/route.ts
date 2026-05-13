import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { name, email, socialLink, followers } = data;

    if (!name || !email || !socialLink || !followers) {
      return NextResponse.json(
        { success: false, error: "Toate campurile sunt obligatorii." },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    await dbQuery(
      `
      INSERT INTO creators (name, email, social_link, followers, status)
      VALUES ($1, $2, $3, $4, 'pending')
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        social_link = EXCLUDED.social_link,
        followers = EXCLUDED.followers,
        status = 'pending',
        updated_at = now()
      `,
      [name, normalizedEmail, socialLink, followers],
    );

    return NextResponse.json({
      success: true,
      message: "Aplicatia ta a fost primita.",
    });
  } catch (error: any) {
    console.error("[Apply Creator API] Error:", error);
    return NextResponse.json(
      { success: false, error: "A aparut o eroare la salvarea aplicatiei." },
      { status: 500 },
    );
  }
}
