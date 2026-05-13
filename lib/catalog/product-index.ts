import { dbQuery } from "@/lib/db";

export type IndexedProduct = {
  id: string;
  supplier_product_id: string;
  supplier_variant_id: string;
  handle: string;
  title: string;
  description: string;
  category: string;
  vendor: string;
  tags: string[];
  image_url: string | null;
  price: number;
  compare_at_price: number | null;
  available_for_sale: boolean;
  inventory_quantity: number | null;
  rating: number | null;
  orders_count: number | null;
  created_at: string;
  updated_at: string;
};

export async function searchIndexedProducts({
  query,
  limit = 24,
  cursor,
  minPrice,
  maxPrice,
}: {
  query?: string;
  limit?: number;
  cursor?: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  const params: any[] = [];
  const where: string[] = [];

  if (query?.trim()) {
    params.push(query.trim());
    where.push(`search_document @@ websearch_to_tsquery('simple', $${params.length})`);
  }

  if (typeof minPrice === "number") {
    params.push(minPrice);
    where.push(`price >= $${params.length}`);
  }

  if (typeof maxPrice === "number") {
    params.push(maxPrice);
    where.push(`price <= $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    where.push(`id < $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(Math.min(limit, 60));

  const sql = `
    SELECT
      id,
      supplier_product_id,
      supplier_variant_id,
      handle,
      title,
      description,
      category,
      vendor,
      tags,
      image_url,
      price,
      compare_at_price,
      available_for_sale,
      inventory_quantity,
      rating,
      orders_count,
      created_at,
      updated_at
    FROM product_index
    ${whereSql}
    ORDER BY updated_at DESC
    LIMIT $${params.length}
  `;

  const result = await dbQuery<IndexedProduct>(sql, params);

  const nextCursor = result.rows.length
    ? result.rows[result.rows.length - 1].id
    : null;

  return {
    products: result.rows,
    nextCursor,
  };
}

export async function upsertIndexedProducts(products: any[]) {
  if (!products.length) return;

  const values: string[] = [];
  const params: any[] = [];

  products.forEach((p, index) => {
    const offset = index * 15;

    values.push(`(
      $${offset + 1},
      $${offset + 2},
      $${offset + 3},
      $${offset + 4},
      $${offset + 5},
      $${offset + 6},
      $${offset + 7},
      $${offset + 8},
      $${offset + 9},
      $${offset + 10},
      $${offset + 11},
      $${offset + 12},
      $${offset + 13},
      $${offset + 14},
      NOW()
    )`);

    params.push(
      p.id,
      p.supplierProductId,
      p.supplierVariantId,
      p.handle,
      p.title,
      p.description,
      p.category,
      p.vendor,
      p.tags || [],
      p.imageUrl,
      p.price,
      p.compareAtPrice,
      p.availableForSale ?? true,
      p.inventoryQuantity ?? null,
    );
  });

  await dbQuery(
    `
      INSERT INTO product_index (
        id,
        supplier_product_id,
        supplier_variant_id,
        handle,
        title,
        description,
        category,
        vendor,
        tags,
        image_url,
        price,
        compare_at_price,
        available_for_sale,
        inventory_quantity,
        updated_at
      )
      VALUES ${values.join(",")}
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        vendor = EXCLUDED.vendor,
        tags = EXCLUDED.tags,
        image_url = EXCLUDED.image_url,
        price = EXCLUDED.price,
        compare_at_price = EXCLUDED.compare_at_price,
        available_for_sale = EXCLUDED.available_for_sale,
        inventory_quantity = EXCLUDED.inventory_quantity,
        updated_at = NOW()
    `,
    params
  );
}
