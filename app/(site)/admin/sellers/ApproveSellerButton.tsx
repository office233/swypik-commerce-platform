"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

export default function ApproveSellerButton() {
  const t = useTranslations("adminSellers");
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(t("confirmApprove"))) {
          e.preventDefault();
        }
      }}
      className="bg-[#0D0D0D] text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-[#0D0D0D]/80 transition disabled:opacity-50"
    >
      {pending ? t("loading") : t("approve")}
    </button>
  );
}
