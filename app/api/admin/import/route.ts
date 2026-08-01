import { NextResponse } from "next/server";
import { labelProduct } from "@/lib/moderation/labelProduct";
import { autoEmbedProduct } from "@/lib/ai/auto-embed";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CsvRow {
  [key: string]: string | undefined;
  title?: string;
  price?: string;
  description?: string;
  image_url?: string;
  category?: string;
  stock?: string;
}

interface ImportError {
  row: number;
  reason: string;
  data?: Record<string, string | undefined>;
}

/**
 * Minimal RFC-4180-ish CSV parser.
 * Handles quoted fields with embedded commas, newlines & escaped quotes ("").
 */
function parseCsv(raw: string): Record<string, string>[] {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && raw[i + 1] === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim() !== "")) lines.push(current);
        current = [];
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }

  // flush last field / row
  current.push(field);
  if (current.some((c) => c.trim() !== "")) lines.push(current);

  if (lines.length === 0) return [];

  const headers = lines[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (lines[r][c] ?? "").trim();
    }
    rows.push(obj);
  }

  return rows;
}

function inventoryFromStock(stock: string | undefined): string {
  if (!stock) return "unknown";
  const n = parseInt(stock, 10);
  if (isNaN(n)) return "unknown";
  if (n <= 0) return "out_of_stock";
  if (n <= 5) return "low_stock";
  return "in_stock";
}

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/import                                            */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const body = await req.json();
    const csvText: string | undefined = body.csv;

    if (!csvText || typeof csvText !== "string") {
      return NextResponse.json(
        { success: false, imported: 0, errors: [{ row: 0, reason: "No CSV data provided." }] },
        { status: 400 }
      );
    }

    // DoS guard: cap payload size and row count.
    const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
    const MAX_CSV_ROWS = 5000;
    if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
      return NextResponse.json(
        { success: false, imported: 0, errors: [{ row: 0, reason: "CSV too large (max 5 MB)." }] },
        { status: 413 }
      );
    }

    const rows = parseCsv(csvText);

    if (rows.length > MAX_CSV_ROWS) {
      return NextResponse.json(
        { success: false, imported: 0, errors: [{ row: 0, reason: `Too many rows (max ${MAX_CSV_ROWS}).` }] },
        { status: 413 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, imported: 0, errors: [{ row: 0, reason: "CSV file is empty or has no data rows." }] },
        { status: 400 }
      );
    }

    let imported = 0;
    const errors: ImportError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];
      const row = rowData as CsvRow;
      const rowNumber = i + 2; // +2 because row 1 is the header, and we're 1-indexed

      const title = row.title?.trim();
      const priceRaw = row.price?.trim();

      // ---- validation ----
      if (!title) {
        errors.push({ row: rowNumber, reason: "Lipsește titlul (title).", data: rowData });
        continue;
      }

      if (!priceRaw) {
        errors.push({ row: rowNumber, reason: "Lipsește prețul (price).", data: rowData });
        continue;
      }

      const priceNum = parseFloat(priceRaw);
      if (isNaN(priceNum) || priceNum < 0) {
        errors.push({ row: rowNumber, reason: `Preț invalid: "${priceRaw}".`, data: rowData });
        continue;
      }

      const priceCents = Math.round(priceNum * 100);
      const slug = slugify(title) + "-" + Date.now().toString(36) + i.toString(36);
      const description = row.description?.trim() || null;
      const imageUrl = row.image_url?.trim() || null;
      const category = row.category?.trim() || null;
      const inventoryStatus = inventoryFromStock(row.stock);

      try {
        const { rows: insRows } = await dbQuery(
          `INSERT INTO marketplace_products (
            title, slug, description, image_url, category,
            currency, price_cents, status, inventory_status,
            source_type, metadata
          ) VALUES (
            $1, $2, $3, $4, $5,
            'RON', $6, 'active', $7,
            'manual', jsonb_build_object('imported_via', 'csv_bulk', 'imported_at', now()::text)
          ) RETURNING id`,
          [title, slug, description, imageUrl, category, priceCents, inventoryStatus]
        );
        if (insRows[0]?.id) {
          autoEmbedProduct(insRows[0].id, title, description);
          labelProduct({ id: insRows[0].id, title, description, category }).catch(() => { });
        }
        imported++;
      } catch (dbErr: any) {
        errors.push({
          row: rowNumber,
          reason: `DB error: ${dbErr.message?.slice(0, 200) ?? "Unknown"}`,
          data: rowData,
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      total: rows.length,
      errors,
    });
  } catch (err: any) {
    logger.error({ err: err }, "CSV import error:");
    return NextResponse.json(
      { success: false, imported: 0, errors: [{ row: 0, reason: err.message || "Server error." }] },
      { status: 500 }
    );
  }
}
