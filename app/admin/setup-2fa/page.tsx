import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/security/admin-auth";
import AdminSetup2FAClient from "./AdminSetup2FAClient";

// Page is only reachable for already-logged-in admins (whether via the
// grace path or after they already have TOTP enabled and want to rotate).
export default async function AdminSetup2FAPage() {
  if (!(await hasAdminSession())) {
    redirect("/admin");
  }
  return <AdminSetup2FAClient />;
}
