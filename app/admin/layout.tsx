import type { ReactNode } from "react";
import { hasAdminSession, isAdminConfigured } from "@/lib/security/admin-auth";
import AdminLoginForm from "./AdminLoginForm";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isAdminConfigured()) {
    return <AdminLoginForm mode="misconfigured" />;
  }

  if (!(await hasAdminSession())) {
    return <AdminLoginForm mode="login" />;
  }

  return <AdminShell>{children}</AdminShell>;
}
