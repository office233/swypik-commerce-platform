import AccountPageClient from "./AccountPageClient";

type AccountPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectValue = resolvedSearchParams.redirect;
  const redirectTo = Array.isArray(redirectValue) ? redirectValue[0] || "/" : redirectValue || "/";

  return <AccountPageClient redirectTo={redirectTo} />;
}
