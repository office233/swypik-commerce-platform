"use client";

import type { ReactNode } from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileSpreadsheet,
  Package,
  Plus,
  Video,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  ArrowUpDown,
} from "lucide-react";

/* ─── Types ─── */

interface Product {
  id: string;
  title: string;
  slug: string;
  brand: string | null;
  category: string | null;
  status: string | null;
  source_type: string | null;
  inventory_status: string | null;
  product_url: string | null;
  image_url: string | null;
  currency: string | null;
  price_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
  orders: number | null;
  has_video: boolean | null;
}

type SortField = "title" | "price" | "date";
type SortDir = "asc" | "desc";

/* ─── Constants ─── */

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "all", label: "Toate" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "inactive", label: "Inactive" },
] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "Toate sursele" },
  { value: "aliexpress", label: "AliExpress" },
  { value: "cj", label: "CJ Dropshipping" },
  { value: "local_seller", label: "Local Seller" },
] as const;

/* ─── Main Page ─── */

export default function MarketplaceAdminPage() {
  /* Data loading */
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/marketplace", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Nu am putut incarca produsele.");
        return res.json();
      })
      .then((data) => {
        setAllProducts(data.products ?? []);
        setLoadError(null);
      })
      .catch((error) => {
        setAllProducts([]);
        setLoadError(error instanceof Error ? error.message : "Nu am putut incarca produsele.");
      })
      .finally(() => setLoading(false));
  }, []);

  /* Search & filter state */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  /* Sort state */
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* Pagination */
  const [currentPage, setCurrentPage] = useState(1);

  /* Reset to page 1 when filters/search change */
  const handleSearchChange = useCallback((v: string) => {
    setSearchQuery(v);
    setCurrentPage(1);
  }, []);
  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v);
    setCurrentPage(1);
  }, []);
  const handleSourceChange = useCallback((v: string) => {
    setSourceFilter(v);
    setCurrentPage(1);
  }, []);

  /* Derived: filtered + sorted list */
  const filteredProducts = useMemo(() => {
    let list = allProducts;

    /* Search */
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.slug?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }

    /* Status filter */
    if (statusFilter !== "all") {
      list = list.filter((p) => (p.status || "draft") === statusFilter);
    }

    /* Source filter */
    if (sourceFilter !== "all") {
      list = list.filter((p) => {
        const src = (p.source_type || "").toLowerCase();
        if (sourceFilter === "aliexpress") return src.includes("aliexpress") || src.includes("ali");
        if (sourceFilter === "cj") return src.includes("cj");
        if (sourceFilter === "local_seller") return src.includes("local") || src.includes("seller");
        return true;
      });
    }

    /* Sort */
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = (a.title || "").localeCompare(b.title || "", "ro");
      } else if (sortField === "price") {
        cmp = (a.price_cents ?? 0) - (b.price_cents ?? 0);
      } else {
        /* date */
        const da = new Date(a.updated_at || a.created_at || 0).getTime();
        const db = new Date(b.updated_at || b.created_at || 0).getTime();
        cmp = da - db;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [allProducts, searchQuery, statusFilter, sourceFilter, sortField, sortDir]);

  /* Derived: paginated slice */
  const totalFiltered = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(startIdx, startIdx + PAGE_SIZE);

  /* Summary counters (from full dataset) */
  const totalProducts = allProducts.length;
  const activeProducts = allProducts.filter((p) => p.status === "active").length;
  const withImages = allProducts.filter((p) => Boolean(p.image_url)).length;
  const withVideo = allProducts.filter((p) => Boolean(p.has_video)).length;

  /* Sort toggle helper */
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 text-orange-600" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Marketplace products</h1>
          <p className="mt-2 text-slate-500">
            Create, price, and maintain marketplace listings without leaving the admin surface.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/marketplace/import"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import CSV
          </Link>
          <Link
            href="/admin/marketplace/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New product
          </Link>
        </div>
      </div>

      {/* ─── Summary cards ─── */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total produse" value={String(totalProducts)} loading={loading} />
        <SummaryCard label="Active" value={String(activeProducts)} loading={loading} />
        <SummaryCard label="Cu imagine" value={String(withImages)} loading={loading} />
        <SummaryCard label="Cu video" value={String(withVideo)} loading={loading} />
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* ─── Toolbar: Search + Filters ─── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            id="marketplace-search"
            type="text"
            placeholder="Caută produse după titlu, slug, brand sau categorie..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Filter className="w-4 h-4" />
            Filtre
          </div>

          {/* Status dropdown */}
          <div className="flex-1 sm:max-w-[200px]">
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all cursor-pointer appearance-none"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2394a3b8\' d=\'M6 8.825a.5.5 0 01-.354-.146l-3-3a.5.5 0 11.708-.708L6 7.621l2.646-2.647a.5.5 0 11.708.708l-3 3A.5.5 0 016 8.825z\'/%3E%3C/svg%3E")',
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px",
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Status: {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Source dropdown */}
          <div className="flex-1 sm:max-w-[220px]">
            <select
              id="filter-source"
              value={sourceFilter}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all cursor-pointer appearance-none"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2394a3b8\' d=\'M6 8.825a.5.5 0 01-.354-.146l-3-3a.5.5 0 11.708-.708L6 7.621l2.646-2.647a.5.5 0 11.708.708l-3 3A.5.5 0 016 8.825z\'/%3E%3C/svg%3E")',
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px",
              }}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sursă: {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result counter */}
          <div className="ml-auto text-sm text-slate-500 tabular-nums">
            {totalFiltered} {totalFiltered === 1 ? "produs" : "produse"} găsite
          </div>
        </div>
      </div>

      {/* ─── Product table ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-700">
                  <button
                    onClick={() => toggleSort("title")}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    Listing
                    <SortIcon field="title" />
                  </button>
                </th>
                <th className="px-6 py-4 font-bold text-slate-700">Source</th>
                <th className="px-6 py-4 font-bold text-slate-700">
                  <button
                    onClick={() => toggleSort("price")}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    Price
                    <SortIcon field="price" />
                  </button>
                </th>
                <th className="px-6 py-4 font-bold text-slate-700">Inventory</th>
                <th className="px-6 py-4 font-bold text-slate-700">Assets</th>
                <th className="px-6 py-4 font-bold text-slate-700">
                  <button
                    onClick={() => toggleSort("date")}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    Status / Data
                    <SortIcon field="date" />
                  </button>
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
              ) : pageProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                    {allProducts.length === 0
                      ? "No marketplace products found yet. Create the first record to start merchandising inventory."
                      : "Niciun produs nu corespunde filtrelor selectate."}
                  </td>
                </tr>
              ) : (
                pageProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* Listing */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt={product.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 line-clamp-1">
                            {product.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {product.brand || product.category || "Unclassified"}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400">
                            {product.slug || product.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-semibold text-slate-900">
                        {product.source_type || "manual"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {product.orders || 0} orders
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {typeof product.price_cents === "number"
                        ? `${(product.price_cents / 100).toFixed(2)} ${product.currency || "USD"}`
                        : "Not set"}
                    </td>

                    {/* Inventory */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                        {(product.inventory_status || "unknown").replace(/_/g, " ")}
                      </span>
                    </td>

                    {/* Assets */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <AssetPill
                          label={product.image_url ? "Image" : "No image"}
                          tone={product.image_url ? "ready" : "muted"}
                        />
                        <AssetPill
                          label={product.has_video ? "Video" : "No video"}
                          tone={product.has_video ? "ready" : "muted"}
                          icon={
                            product.has_video ? (
                              <Video className="w-3 h-3" />
                            ) : undefined
                          }
                        />
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${
                          product.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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

                    {/* Actions */}
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination bar ─── */}
        {!loading && totalFiltered > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 bg-slate-50/60 px-6 py-4">
            <div className="text-sm text-slate-500 tabular-nums">
              Afișare{" "}
              <span className="font-bold text-slate-700">
                {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, totalFiltered)}
              </span>{" "}
              din <span className="font-bold text-slate-700">{totalFiltered}</span> produse
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Pagina anterioară
              </button>

              {/* Page indicator */}
              <div className="flex items-center gap-1">
                {generatePageNumbers(safePage, totalPages).map((pageNum, i) =>
                  pageNum === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum as number)}
                      className={`min-w-[36px] rounded-lg px-2 py-1.5 text-sm font-bold transition-all ${
                        pageNum === safePage
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Pagina următoare
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page number generator (smart ellipsis) ─── */

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  pages.push(1);

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");
  pages.push(total);

  return pages;
}

/* ─── Sub-components ─── */

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
      )}
    </div>
  );
}

function AssetPill({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "ready" | "muted";
  icon?: ReactNode;
}) {
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
