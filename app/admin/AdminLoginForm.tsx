"use client";

import { useState } from "react";

type AdminLoginFormProps = {
  mode: "login" | "misconfigured";
};

export default function AdminLoginForm({ mode }: AdminLoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "login") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload.error || "Authentication failed.");
        return;
      }

      window.location.reload();
    } catch {
      setError("Could not reach the admin login endpoint.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 shadow-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-black text-[#0D0D0D]">Swypik Admin</h1>
            <p className="text-sm text-[#6E6E80] mt-2">
              {mode === "misconfigured"
                ? "ADMIN_SECRET is missing. Configure it before using the admin surface."
                : "Sign in with the admin password to manage orders, marketplace products, and sellers."}
            </p>
          </div>

          {mode === "login" ? (
            <form method="post" onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-password" className="block text-sm font-bold text-[#0D0D0D] mb-2">
                  Admin password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                  className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3.5 text-sm font-medium text-[#0D0D0D] outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] transition"
                />
              </div>
              {error ? <p className="text-sm font-bold text-[#df1b41]">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-transform active:scale-[0.98]"
              >
                {loading ? "Signing in..." : "Enter admin"}
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Set `ADMIN_SECRET` in the environment and reload the page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
