"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Package,
  Video,
} from "lucide-react";
import type { Product, SortDir, SortField } from "./types";

interface Props {
  products: Product[];
  loading: boolean;
  totalProducts: number;
  hasFiltersActive: boolean;
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
}

export function ProductTable({
  products,
  loading,
  totalProducts,
  hasFiltersActive,
  sortField,
  sortDir,
  onToggleSort,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-6 py-4 font-bold text-slate-700">
              <SortButton field="title" current={sortField} dir={sortDir} onClick={onToggleSort}>
                Listing
              </SortButton>
            </th>
            <th className="px-6 py-4 font-bold text-slate-700">Source</th>
            <th className="px-6 py-4 font-bold text-slate-700">
              <SortButton field="price" current={sortField} dir={sortDir} onClick={onToggleSort}>
                Price
              </SortButton>
            </th>
            <th className="px-6 py-4 font-bold text-slate-700">Inventory</th>
            <th className="px-6 py-4 font-bold text-slate-700">Assets</th>
            <th className="px-6 py-4 font-bold text-slate-700">
              <SortButton field="date" current={sortField} dir={sortDir} onClick={onToggleSort}>
                Status / Data
              </SortButton>
            </th>
            <th className="px-6 py-4 font-bold text-slate-700 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={7} className="px-6 py-16 text-center">
                <div className="inline-flex items-center gap-3 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Se încarcă produsele…
                </div>
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                {totalProducts === 0 && !hasFiltersActive
                  ? "No marketplace products found yet. Create the first record to start merchandising inventory."
                  : "Niciun produs nu corespunde filtrelor selectate."}
              </td>
            </tr>
          ) : (
            products.map((product) => <ProductRow key={product.id} product={product} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortButton({
  field,
  current,
  dir,
  onClick,
  children,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  children: ReactNode;
}) {
  const Icon =
    current !== field ? (
      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
    ) : dir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 text-orange-600" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
    );

  return (
    <button
      onClick={() => onClick(field)}
      className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
    >
      {children}
      {Icon}
    </button>
  );
}

function ProductRow({ product }: { product: Product }) {
  return (
    <tr className="hover:bg-slate-50/70 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <Package className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 line-clamp-1">{product.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {product.brand || product.category || "Unclassified"}
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-400">{product.slug || product.id}</div>
          </div>
        </div>
      </td>

      <td className="px-6 py-4 text-slate-600">
        <div className="font-semibold text-slate-900">{product.source_type || "manual"}</div>
        <div className="text-xs text-slate-500">{product.orders || 0} orders</div>
      </td>

      <td className="px-6 py-4 font-semibold text-slate-900">
        {typeof product.price_cents === "number"
          ? `${(product.price_cents / 100).toFixed(2)} ${product.currency || "USD"}`
          : "Not set"}
      </td>

      <td className="px-6 py-4">
        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
          {(product.inventory_status || "unknown").replace(/_/g, " ")}
        </span>
      </td>

      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <AssetPill label={product.image_url ? "Image" : "No image"} tone={product.image_url ? "ready" : "muted"} />
          <AssetPill
            label={product.has_video ? "Video" : "No video"}
            tone={product.has_video ? "ready" : "muted"}
            icon={product.has_video ? <Video className="w-3 h-3" /> : undefined}
          />
        </div>
      </td>

      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${
            product.status === "active"
              ? "border-neutral-100 bg-neutral-100 text-neutral-900"
              : product.status === "inactive"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-100 text-slate-700"
          }`}
        >
          {product.status || "draft"}
        </span>
        {product.updated_at && (
          <div className="mt-1 text-[11px] text-slate-400">
            {new Date(product.updated_at).toLocaleDateString("ro-RO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        )}
      </td>

      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-3">
          {product.product_url ? (
            <a
              href={product.product_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-900"
            >
              Source
              <ExternalLink className="w-4 h-4" />
            </a>
          ) : null}
          <Link
            href={`/admin/marketplace/${product.id}`}
            className="text-sm font-bold text-orange-600 hover:underline"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}

function AssetPill({ label, tone, icon }: { label: string; tone: "ready" | "muted"; icon?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${
        tone === "ready"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-100 text-slate-500"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
