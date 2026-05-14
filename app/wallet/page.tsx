import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import WalletClient from "./WalletClient";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await getAuthUser();
  if (!user.userId) {
    redirect("/account?redirect=/wallet");
  }
  return <WalletClient />;
}
