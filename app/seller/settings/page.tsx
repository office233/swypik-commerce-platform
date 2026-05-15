import { dbQuery } from "@/lib/db";
import { isEnabled } from "@/lib/feature-flags";
import { redirect } from "next/navigation";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { Settings, Save, Bell, Shield, Wallet, CheckCircle2, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SellerSettingsPage() {
  // SECURITY (P0-D): resolve seller from signed cookie session, NEVER from client-supplied headers.
  // Previously read x-seller-id from request headers => IDOR (any client could spoof via reverse proxy).
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    redirect("/seller/login");
  }

  const { rows } = await dbQuery("SELECT * FROM sellers WHERE id = $1", [sellerId]);
  const seller: any = rows[0] || null;

  if (!seller) {
    redirect("/seller/login");
  }

  const isStripeConnected = !!seller.stripe_account_id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0D0D0D]">Setări Cont</h1>
        <p className="text-sm text-neutral-500 mt-1">Configurează detaliile magazinului și plățile tale.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-2">
          <nav className="flex flex-col gap-1">
            <button className="flex items-center gap-3 px-4 py-2.5 bg-[#0D0D0D] text-white rounded-lg text-sm font-medium w-full text-left transition-colors">
              <Settings className="w-4 h-4" /> Detalii Magazin
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors">
              <Wallet className="w-4 h-4" /> Plăți (Stripe)
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors">
              <Bell className="w-4 h-4" /> Notificări
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors">
              <Shield className="w-4 h-4" /> Securitate
            </button>
          </nav>
        </div>

        <div className="md:col-span-2 space-y-6">
          {/* Profile Section */}
          <div className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-medium text-[#0D0D0D] mb-4">Profil Magazin</h2>
            <form className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Nume Magazin</label>
                  <input 
                    type="text" 
                    defaultValue={seller.name}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Email Contact</label>
                  <input 
                    type="email" 
                    defaultValue={seller.email}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Descriere Scurtă</label>
                <textarea 
                  rows={3}
                  defaultValue={seller.business_details?.description || ""}
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors resize-none"
                />
              </div>

              <div className="pt-2 border-t border-[#E5E5E5] flex justify-end">
                <button type="button" className="bg-[#0D0D0D] hover:bg-neutral-800 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Save className="w-4 h-4" /> Salvează Modificările
                </button>
              </div>
            </form>
          </div>

          {/* Stripe Connect Section */}
          {isEnabled('stripeConnect') && (
          <div className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-medium text-[#0D0D0D] mb-2 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#635BFF]" /> Stripe Connect
            </h2>
            <p className="text-sm text-neutral-500 mb-6">
              Conectează-ți contul bancar pentru a primi plățile direct și automat de la clienți, fără intermediari.
            </p>

            {isStripeConnected ? (
              <div className="flex items-center justify-between p-4 bg-neutral-100/50 border border-neutral-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-neutral-900" />
                  <div>
                    <p className="font-medium text-neutral-900 text-sm">Cont conectat cu succes</p>
                    <p className="text-xs text-neutral-900 mt-0.5 font-mono">{seller.stripe_account_id}</p>
                  </div>
                </div>
                <button className="text-sm font-medium text-neutral-600 hover:text-[#0D0D0D] flex items-center gap-1.5 transition-colors">
                  Setări Financiare <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <form action={async () => {
                "use server";
                // A client side approach is typically better for redirects but since Next 14 Server Actions can redirect, we could just do it here or render a Client Component button.
                // To keep it simple without creating another file, we use a standard client-side fetch below inside a button.
              }}>
                <button 
                  type="button"
                  formAction={undefined}
                  className="bg-[#635BFF] hover:bg-[#5249ea] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
                >
                  Conectează contul cu Stripe
                </button>
                <script dangerouslySetInnerHTML={{
                  __html: `
                    document.currentScript.previousElementSibling.addEventListener('click', async function() {
                      this.disabled = true;
                      this.innerHTML = "Se conectează...";
                      try {
                        const res = await fetch('/api/seller/stripe-connect', { method: 'POST' });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                        else alert('Eroare: ' + (data.error || 'Server error'));
                      } catch (e) { alert(e); }
                      this.disabled = false;
                      this.innerHTML = "Conectează contul cu Stripe";
                    });
                  `
                }} />
              </form>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
