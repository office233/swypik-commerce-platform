import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

type Address = {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  country_code: string;
  is_default: boolean;
  created_at: string;
};

const ALLOWED_COUNTRIES = ["RO", "MD", "BG", "HU", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "GB"];

function validate(body: Record<string, unknown>): { ok: true; data: Omit<Address, "id" | "created_at"> } | { ok: false; error: string } {
  const recipient_name = String(body.recipient_name || "").trim();
  const line1 = String(body.line1 || "").trim();
  const city = String(body.city || "").trim();
  const postal_code = String(body.postal_code || "").trim();
  const country_code = String(body.country_code || "RO").toUpperCase();
  if (!recipient_name) return { ok: false, error: "Numele destinatarului este obligatoriu." };
  if (!line1) return { ok: false, error: "Strada (linia 1) este obligatorie." };
  if (!city) return { ok: false, error: "Orașul este obligatoriu." };
  if (!postal_code) return { ok: false, error: "Codul poștal este obligatoriu." };
  if (!ALLOWED_COUNTRIES.includes(country_code)) return { ok: false, error: "Țara selectată nu este suportată." };
  return {
    ok: true,
    data: {
      label: body.label ? String(body.label).trim() || null : null,
      recipient_name,
      phone: body.phone ? String(body.phone).trim() || null : null,
      line1,
      line2: body.line2 ? String(body.line2).trim() || null : null,
      city,
      region: body.region ? String(body.region).trim() || null : null,
      postal_code,
      country_code,
      is_default: Boolean(body.is_default),
    },
  };
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rows } = await dbQuery<Address>(
    `SELECT id, label, recipient_name, phone, line1, line2, city, region, postal_code,
            country_code, is_default, created_at
     FROM user_addresses WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [session.userId],
  );
  return NextResponse.json({ addresses: rows });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (v.data.is_default) {
    await dbQuery(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [session.userId]);
  } else {
    const { rows: existing } = await dbQuery<{ c: string }>(
      `SELECT count(*)::text c FROM user_addresses WHERE user_id = $1`,
      [session.userId],
    );
    if (existing[0]?.c === "0") v.data.is_default = true;
  }

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO user_addresses
      (user_id, label, recipient_name, phone, line1, line2, city, region, postal_code, country_code, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      session.userId,
      v.data.label,
      v.data.recipient_name,
      v.data.phone,
      v.data.line1,
      v.data.line2,
      v.data.city,
      v.data.region,
      v.data.postal_code,
      v.data.country_code,
      v.data.is_default,
    ],
  );
  return NextResponse.json({ success: true, id: rows[0].id });
}
