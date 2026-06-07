import { Metadata } from "next";
import InviteFriendClient from "./InviteFriendClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invite friends · Swypik",
  description: "Share your referral link and earn +10% mining boost for each active friend.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InviteFriendClient />;
}
