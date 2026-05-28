import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function VoicePage() {
  // Voice shopping not enabled in this build; redirect to search.
  redirect("/search");
}
