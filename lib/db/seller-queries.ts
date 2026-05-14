import { dbQuery } from "@/lib/db";

export type Seller = {
  id: string;
  name: string;
  email: string;
  status: string;
  stripe_account_id?: string;
  business_details?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export async function createSeller(data: Omit<Seller, "id" | "created_at" | "updated_at">): Promise<Seller> {
  const { rows } = await dbQuery(
    `
    INSERT INTO sellers (name, email, status, stripe_account_id, business_details)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [data.name, data.email, data.status || 'pending', data.stripe_account_id, data.business_details]
  );
  return rows[0];
}

export async function getSellerById(id: string): Promise<Seller | null> {
  const { rows } = await dbQuery(`SELECT * FROM sellers WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function updateSellerStatus(id: string, status: string): Promise<Seller | null> {
  const { rows } = await dbQuery(
    `
    UPDATE sellers
    SET status = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
    [id, status]
  );
  return rows[0] || null;
}
