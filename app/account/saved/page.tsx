import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/i18n/currency";
import { CURRENCY_COOKIE, isCurrency, DEFAULT_CURRENCY, type Currency } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

type Row = {
  product_id: string;
  title: string;
  slug: string | null;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
  created_at: string;
};

export default async function SavedProductsPage() {
  const user = await getAuthUser();
  if (!user.userId) redirect("/account?redirect=/account/saved");

  const cookieStore = await cookies();
  const cookieCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const displayCurrency: Currency =
    cookieCurrency && isCurrency(cookieCurrency) ? cookieCurrency : DEFAULT_CURRENCY;

  const { rows } = await dbQuery<Row>(
    `SELECT sp.product_id, p.title, p.slug, p.image_url, p.price_cents, p.currency, sp.created_at
       FROM saved_products sp
       JOIN marketplace_products p ON p.id = sp.product_id
      WHERE sp.user_id = $1
      ORDER BY sp.created_at DESC
      LIMIT 200`,
    [user.userId],
  );

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Link href="/account" className="p-1 -ml-1">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">Produse salvate</h1>
      </header>
      <div className="px-3 md:px-6 pt-4 max-w-5xl mx-auto">
        {rows.length === 0 ? (
          <p className="text-white/50 text-sm mt-8 text-center">
            Nu ai produse salvate. Salvează produse din feed sau /shop.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {rows.map((r) => {
              const href = r.slug ? `/product/${r.slug}` : `/product/${r.product_id}`;
              const priceLabel =
                r.price_cents != null
                  ? formatCurrency(r.price_cents, {
                      sourceCurrency: (r.currency?.trim() as Currency) || "RON",
                      displayCurrency,
                      locale: "ro",
                    })
                  : null;
              return (
                <Link
                  key={r.product_id}
                  href={href}
                  className="group rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]"
                >
                  <div className="relative aspect-square bg-white/5">
                    {r.image_url ? (
                      <Image
                        src={r.image_url}
                        alt={r.title}
                        fill
                        sizes="(max-width:768px) 50vw, 25vw"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs md:text-sm font-semibold line-clamp-2">{r.title}</div>
                    {priceLabel && (
                      <div className="mt-1 text-xs md:text-sm font-bold text-pink-400">
                        {priceLabel}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
