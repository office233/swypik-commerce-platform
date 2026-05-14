import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  return (
    <main className="min-h-screen bg-white text-[#0D0D0D] dark:bg-[#0D0D0D] dark:text-white">
      <InboxClient />
    </main>
  );
}
