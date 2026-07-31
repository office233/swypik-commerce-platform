import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, ImageIcon, Package, Save, Video } from "lucide-react";

type ProductRecord = {
  id?: string;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  product_url?: string | null;
  image_url?: string | null;
  currency?: string | null;
  price_cents?: number | null;
  compare_at_price_cents?: number | null;
  status?: string | null;
  inventory_status?: string | null;
  source_type?: string | null;
  supplier?: string | null;
  supplier_product_id?: string | null;
  supplier_url?: string | null;
  supplier_cost_cents?: number | null;
  metadata?: Record<string, any> | null;
};

type ProductEditorFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  product?: ProductRecord;
  notice?: { type: "success" | "error"; message: string } | null;
};

const statusOptions = ["draft", "active", "out_of_stock", "archived", "disabled"];
const inventoryOptions = ["unknown", "in_stock", "low_stock", "out_of_stock", "preorder"];
const sourceOptions = ["manual", "seller", "affiliate", "multi_erp", "other"];

export default function ProductEditorForm({ mode, action, product, notice }: ProductEditorFormProps) {
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "Edit product" : "Create product";
  const submitLabel = isEdit ? "Save changes" : "Create product";
  const metadata = product?.metadata ?? {};
  const hasVideo = Boolean(metadata.has_video);
  const ordersCount = Number(metadata.orders_count || 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/admin/marketplace"
          className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to marketplace
        </Link>
        {product?.product_url ? (
          <a
            href={product.product_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            Open source link
            <ExternalLink className="w-4 h-4" />
          </a>
        ) : null}
      </div>

      <form action={action} className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{pageTitle}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {isEdit
                ? "Update the listing data that powers pricing, merchandising, and source references."
                : "Create a complete marketplace record with pricing, merchandising, and sourcing details."}
            </p>
            {product?.id ? <p className="mt-2 font-mono text-xs text-slate-500">{product.id}</p> : null}
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
          >
            <Save className="w-4 h-4" />
            {submitLabel}
          </button>
        </div>

        {notice ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${notice.type === "success"
                ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                : "border-red-200 bg-red-50 text-red-900"
              }`}
          >
            <div className="flex items-start gap-2">
              {notice.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-slate-400" />
                Product details
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Title" name="title" defaultValue={product?.title} required />
                <Field label="Slug" name="slug" defaultValue={product?.slug} hint="Auto-normalized on save." />
                <Field label="Brand" name="brand" defaultValue={product?.brand} />
                <Field label="Category" name="category" defaultValue={product?.category} />
                <Field label="Source link" name="product_url" defaultValue={product?.product_url} className="md:col-span-2" />
                <TextArea label="Description" name="description" defaultValue={product?.description} className="md:col-span-2" />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Pricing and availability</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Price (cents)" name="price_cents" type="number" defaultValue={asInputValue(product?.price_cents)} required />
                <Field
                  label="Compare-at price (cents)"
                  name="compare_at_price_cents"
                  type="number"
                  defaultValue={asInputValue(product?.compare_at_price_cents)}
                />
                <Field label="Currency" name="currency" defaultValue={product?.currency || "USD"} maxLength={3} />
                <SelectField label="Status" name="status" defaultValue={product?.status || "draft"} options={statusOptions} />
                <SelectField
                  label="Inventory status"
                  name="inventory_status"
                  defaultValue={product?.inventory_status || "unknown"}
                  options={inventoryOptions}
                />
                <SelectField label="Source type" name="source_type" defaultValue={product?.source_type || "manual"} options={sourceOptions} />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Media and sourcing</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Image URL" name="image_url" defaultValue={product?.image_url} className="md:col-span-2" />
                <Field label="Supplier" name="supplier" defaultValue={product?.supplier} />
                <Field label="Supplier product ID" name="supplier_product_id" defaultValue={product?.supplier_product_id} />
                <Field label="Supplier URL" name="supplier_url" defaultValue={product?.supplier_url} className="md:col-span-2" />
                <Field
                  label="Supplier cost (cents)"
                  name="supplier_cost_cents"
                  type="number"
                  defaultValue={asInputValue(product?.supplier_cost_cents)}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500 mb-4">Listing snapshot</h2>
              <div className="space-y-4">
                <div className="aspect-square rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                  {product?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.title || "Product image"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center text-slate-400 px-6">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-semibold">No image assigned</p>
                      <p className="text-xs mt-1">Add a direct image URL to show the product preview here.</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatCard label="Orders" value={String(ordersCount)} />
                  <StatCard label="Video" value={hasVideo ? "Attached" : "Unavailable"} />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500 mb-4">Media controls</h2>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
                    <Video className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      {hasVideo ? "Video asset is attached." : "Video upload is disabled in this pass."}
                    </p>
                    <p className="text-xs text-slate-500">
                      {hasVideo
                        ? metadata.video_url || "The existing video metadata is preserved."
                        : "The prior upload button depended on a separate flow outside the admin contract. It is hidden until that path is verified end to end."}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </form>
    </div>
  );
}

function asInputValue(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  hint,
  className,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
  hint?: string;
  className?: string;
  maxLength?: number;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue || ""}
        maxLength={maxLength}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>
      <textarea
        name={name}
        rows={6}
        defaultValue={defaultValue || ""}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
