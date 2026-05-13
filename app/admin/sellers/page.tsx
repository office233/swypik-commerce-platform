import { dbQuery } from "@/lib/db";
import { approveSeller } from "./actions";

export const dynamic = "force-dynamic";

export default async function SellersAdminPage() {
  let sellers: any[] = [];
  try {
    const res = await dbQuery("SELECT id, name, cui, email, phone, product_type, status FROM sellers ORDER BY created_at DESC");
    sellers = res.rows;
  } catch (err) {
    // Fallback if created_at doesn't exist
    try {
      const resFallback = await dbQuery("SELECT id, name, cui, email, phone, product_type, status FROM sellers");
      sellers = resFallback.rows;
    } catch (fallbackErr) {
      console.error("Sellers table might not exist or columns differ:", fallbackErr);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-black text-[#0D0D0D] mb-6">Selleri</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5E5] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-sm font-bold text-[#0D0D0D]">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Nume</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5] text-sm">
            {sellers.map((seller: any) => (
              <tr key={seller.id} className="hover:bg-[#F7F7F8]/50 transition">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">
                  {String(seller.id).split("-")[0]}...
                </td>
                <td className="px-6 py-4 font-medium text-[#0D0D0D]">{seller.name}</td>
                <td className="px-6 py-4 text-gray-600">{seller.email}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      seller.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : seller.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {seller.status || "unknown"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {seller.status !== "approved" && (
                    <form action={approveSeller.bind(null, seller.id)}>
                      <button
                        type="submit"
                        className="bg-[#0D0D0D] text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-[#0D0D0D]/80 transition"
                      >
                        Aprobă
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {sellers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Nu există selleri înregistrați.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
