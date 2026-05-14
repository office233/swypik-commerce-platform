import { NextResponse } from "next/server";
import {
  CURRENCY_COOKIE,
  LOCALE_COOKIE,
  isCurrency,
  isLocale,
} from "@/lib/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function POST(req: Request) {
  let body: { locale?: string; currency?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });

  if (body.locale !== undefined) {
    if (!isLocale(body.locale)) {
      return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
    }
    res.cookies.set(LOCALE_COOKIE, body.locale, {
      maxAge: ONE_YEAR,
      path: "/",
      sameSite: "lax",
    });
  }

  if (body.currency !== undefined) {
    if (!isCurrency(body.currency)) {
      return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
    }
    res.cookies.set(CURRENCY_COOKIE, body.currency, {
      maxAge: ONE_YEAR,
      path: "/",
      sameSite: "lax",
    });
  }

  return res;
}
