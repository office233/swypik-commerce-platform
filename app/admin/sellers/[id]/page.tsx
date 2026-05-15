import { dbQuery } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck, CreditCard, User, Store } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditSellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { rows } = await dbQuery(`
    SELECT 
      u.id as user_id, 
      u.email, 
      u.status as user_status,
      c.id as profile_id,
      c.handle,
      c.display_name,
      c.verification_status,
      c.payout_status,
      c.bio,
      c.website_url,
      c.created_at
    FROM users u
    JOIN creator_profiles c ON u.id = c.user_id
    WHERE c.id = $1
  `, [params.id]);

  if (rows.length === 0) {
    notFound();
  }

  const seller = rows[0];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/sellers" className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Sellers
        </Link>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Manage Seller</h1>
          <p className="text-slate-500 font-mono text-sm">{seller.profile_id}</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors">
            <Save className="w-4 h-4" /> Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Store className="w-5 h-5 text-slate-400" /> Store Profile
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Display Name</label>
                  <input 
                    type="text" 
                    defaultValue={seller.display_name}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Handle (@)</label>
                  <input 
                    type="text" 
                    defaultValue={seller.handle}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Bio / Description</label>
                <textarea 
                  rows={3}
                  defaultValue={seller.bio}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Website URL</label>
                <input 
                  type="url" 
                  defaultValue={seller.website_url}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-slate-400" /> User Account
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  defaultValue={seller.email}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Account Status</label>
                <select 
                  defaultValue={seller.user_status}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-400" /> Verification
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                <select 
                  defaultValue={seller.verification_status}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                >
                  <option value="unverified">Unverified</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {seller.verification_status === 'verified' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
                  This seller has a verified badge and can post products directly to the public feed.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-slate-400" /> Payouts
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Stripe Connect</label>
                <select 
                  defaultValue={seller.payout_status}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors outline-none"
                >
                  <option value="not_connected">Not Connected</option>
                  <option value="pending">Pending</option>
                  <option value="connected">Connected</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>
              <button className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:border-orange-500 hover:text-orange-600 transition-colors">
                View Stripe Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
