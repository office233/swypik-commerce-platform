import { redirect } from "next/navigation";

export default function Page(_props: { params: Promise<{ slug: string }> }) {
  redirect("/explore");
}
