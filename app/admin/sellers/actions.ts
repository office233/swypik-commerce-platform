"use server";

import { dbQuery } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendSellerApprovalEmail } from "@/lib/email/service";

export async function approveSeller(id: string) {
  try {
    const result = await dbQuery("UPDATE sellers SET status = 'approved' WHERE id = $1 RETURNING email, name", [id]);
    
    if (result.rows.length > 0) {
      const { email, name } = result.rows[0];
      if (email) {
        await sendSellerApprovalEmail(email, name || "Seller");
      }
    }

    revalidatePath("/admin/sellers");
  } catch (error) {
    console.error("Error approving seller:", error);
    throw new Error("Failed to approve seller");
  }
}
