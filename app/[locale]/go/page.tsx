import type { Metadata } from "next";
import GoClient from "./GoClient";
import PermissionsPrompt from "@/components/pwa/PermissionsPrompt";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Swypik Go — cursă în oraș",
  description: "Cheamă o mașină în câteva secunde. Preț fix, șofer verificat, urmărire live.",
};

export default function GoPage() {
  return (
    <>
      <GoClient />
      <PermissionsPrompt vertical="go" />
    </>
  );
}
