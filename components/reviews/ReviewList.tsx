import { dbQuery } from "@/lib/db";
import StarRating from "./StarRating";

export type ReviewListProps = {
  productId: string;
  limit?: number;
};

type Row = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
  user_display_name: string | null;
  user_username: string | null;
};

export default async function ReviewList({ productId, limit = 10 }: ReviewListProps) {
  const { rows } = await dbQuery<Row>(
    `SELECT r.id, r.rating, r.title, r.body, r.is_verified_purchase, r.helpful_count, r.created_at,
            u.display_name AS user_display_name, u.username AS user_username
       FROM product_reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.product_id = $1 AND r.is_hidden = false
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [productId, limit]
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500">Niciun review încă. Fii primul care lasă o părere.</p>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const author = r.user_display_name || r.user_username || "Utilizator";
        return (
          <li key={r.id} className="border-b border-gray-200 pb-4 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <StarRating value={r.rating} size={14} />
              <span className="text-sm font-medium">{author}</span>
              {r.is_verified_purchase && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Cumpărător verificat</span>
              )}
            </div>
            {r.title && <p className="font-semibold text-sm mb-1">{r.title}</p>}
            {r.body && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.body}</p>}
            <p className="text-xs text-gray-400 mt-1">
              {new Date(r.created_at).toLocaleDateString("ro-RO")} · {r.helpful_count} utili
            </p>
          </li>
        );
      })}
    </ul>
  );
}
