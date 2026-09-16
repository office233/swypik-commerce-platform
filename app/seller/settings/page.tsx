import { dbQuery } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import SellerSettingsClient from "./SellerSettingsClient";

export const dynamic = "force-dynamic";

export default async function SellerSettingsPage() {
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    redirect("/seller/login");
  }

  const { rows } = await dbQuery<{
    id: string;
    name: string;
    email: string;
    cui: string | null;
    phone: string | null;
    business_details: Record<string, any> | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  }>(
    `SELECT
       s.id,
       s.name,
       s.email,
       s.cui,
       s.phone,
       s.business_details,
       u.username,
       u.display_name,
       u.avatar_url,
       u.bio
     FROM sellers s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [sellerId]
  );

  const seller = rows[0];
  if (!seller) {
    redirect("/seller/login");
  }

  const initialData = {
    sellerId: seller.id,
    name: seller.display_name || seller.name || "",
    username: seller.username || "",
    email: seller.email || "",
    bio: seller.bio || seller.business_details?.description || "",
    avatarUrl: seller.avatar_url || "",
    cui: seller.cui || "",
    phone: seller.phone || "",
    iban: seller.business_details?.iban || "",
    invoiceSeries: seller.business_details?.invoiceSeries || "FACT",
  };

  return <SellerSettingsClient initialData={initialData} />;
}
