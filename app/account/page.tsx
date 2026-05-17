import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import AccountPageClient from "./AccountPageClient";

type AccountPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectValue = resolvedSearchParams.redirect;
  const redirectTo = Array.isArray(redirectValue) ? redirectValue[0] || "/" : redirectValue || "/";

  const session = await getAuthSession();
  if (!session) redirect(`/auth?next=${encodeURIComponent("/account")}`);

  return <AccountPageClient redirectTo={redirectTo} />;
}
