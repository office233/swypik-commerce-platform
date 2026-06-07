import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import EarnClient from "./EarnClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mine $SWYP — Earn Digital Cash | Swypik",
  description:
    "Tap to mine $SWYP daily. Spend it on real products, tip creators, boost content. The first crypto you can actually use.",
};

export default async function EarnPage() {
  const user = await getAuthUser();
  if (!user.userId) {
    redirect("/account?redirect=/earn");
  }
  return <EarnClient />;
}
