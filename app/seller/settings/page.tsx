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
  const payoutsEnabled = !!seller.stripe_payouts_enabled;
  const detailsSubmitted = !!seller.stripe_details_submitted;
  const requirements = seller.stripe_requirements || {};
  const requirementsDue: string[] = Array.isArray(requirements.currently_due) ? requirements.currently_due : [];
  const requirementsDisabledReason: string | null = requirements.disabled_reason || null;
  const onboardingIncomplete = isStripeConnected && (!payoutsEnabled || !detailsSubmitted);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-2xl font-black text-[#0D0D0D]">Setări Cont</h1>
        <p className="text-sm text-neutral-500 mt-1">Configurează detaliile magazinului și plățile tale.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        <div className="md:col-span-1 space-y-2">
          <nav aria-label="Setări secțiuni" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            <button type="button" aria-current="page" className="flex items-center gap-3 px-4 py-3 min-h-[44px] bg-[#0D0D0D] text-white rounded-lg text-sm font-medium w-full text-left transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              <Settings className="w-4 h-4" /> Detalii Magazin
            </button>
            <button type="button" className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              <Wallet className="w-4 h-4" /> Plăți (Stripe)
            </button>
            <button type="button" className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              <Bell className="w-4 h-4" /> Notificări
            </button>
            <button type="button" className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-neutral-600 hover:bg-neutral-100 rounded-lg text-sm font-medium w-full text-left transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
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
                <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="seller-name">Nume Magazin</label>
                  <input
                    id="seller-name"
                    type="text"
                    defaultValue={seller.name}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-[#0D0D0D] transition-colors"
                  />
                </div>
                <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="seller-email">Email Contact</label>
                  <input
                    id="seller-email"
                    type="email"
                    defaultValue={seller.email}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-[#0D0D0D] transition-colors"
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
                <button type="button" className="inline-flex items-center gap-2 bg-[#0D0D0D] hover:bg-neutral-800 text-white px-5 py-2.5 min-h-[44px] rounded-lg text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none">
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
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-neutral-100/50 border border-neutral-100 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className={`w-6 h-6 shrink-0 ${payoutsEnabled ? 'text-green-700' : 'text-yellow-700'}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm">
                        {payoutsEnabled ? 'Payouts activ' : 'Cont creat — onboarding nefinalizat'}
                      </p>
                      <p className="text-xs text-neutral-900 mt-0.5 font-mono truncate">{seller.stripe_account_id}</p>
                    </div>
                  </div>
                  {onboardingIncomplete && (
                    <button
                      type="button"
                      id="stripe-resume-onboarding"
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm font-bold bg-yellow-700 text-white hover:bg-yellow-800 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
                    >
                      Continuă onboarding <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {onboardingIncomplete && (
                  <div className="mt-3 text-xs text-yellow-900 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    {requirementsDisabledReason
                      ? <p>Stripe a dezactivat payout-urile: <span className="font-mono">{requirementsDisabledReason}</span></p>
                      : <p>Mai sunt câmpuri de completat în Stripe înainte ca payout-urile să fie activate.</p>}
                    {requirementsDue.length > 0 && (
                      <ul className="mt-2 list-disc list-inside">
                        {requirementsDue.slice(0, 6).map((r: string) => <li key={r} className="font-mono">{r}</li>)}
                      </ul>
                    )}
                    <script dangerouslySetInnerHTML={{
                      __html: `
                        (function(){
                          var btn = document.getElementById('stripe-resume-onboarding');
                          if (!btn) return;
                          btn.addEventListener('click', async function(){
                            btn.disabled = true;
                            var prev = btn.innerHTML;
                            btn.innerHTML = 'Se redirecționează...';
                            try {
                              var res = await fetch('/api/seller/stripe-connect', { method: 'POST' });
                              var data = await res.json();
                              if (data.url) window.location.href = data.url;
                              else alert('Eroare: ' + (data.error || 'Server error'));
                            } catch (e) { alert(e); }
                            btn.disabled = false;
                            btn.innerHTML = prev;
                          });
                        })();
                      `
                    }} />
                  </div>
                )}
              </>
            ) : (
              <form action={async () => {
                "use server";
                // A client side approach is typically better for redirects but since Next 14 Server Actions can redirect, we could just do it here or render a Client Component button.
                // To keep it simple without creating another file, we use a standard client-side fetch below inside a button.
              }}>
                <button
                  type="button"
                  formAction={undefined}
                  className="inline-flex items-center justify-center bg-[#635BFF] hover:bg-[#5249ea] text-white px-6 py-2.5 min-h-[44px] rounded-lg text-sm font-bold transition-colors w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none"
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
