"use client";

import { useEffect, useState, useRef } from "react";
import { SellerOrder } from "./types";
import { X, Printer, Download, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";

type Props = {
  order: SellerOrder | null;
  isOpen: boolean;
  onClose: () => void;
};

type AwbFullData = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    fulfilledAt: string | null;
    totalRon: string;
    items: Array<{ id: string; title: string; quantity: number; unitPriceRon: string; totalPriceRon: string }>;
  };
  awb: {
    trackingNumber: string;
    carrierName: string;
    courierCode: string;
    trackingUrl: string | null;
    parcelsCount: number;
    weightKg: number;
    notes: string;
    generatedAt: string;
  };
  sender: {
    name: string;
    cui: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    county: string;
  };
  recipient: {
    name: string;
    phone: string;
    email: string;
    line1: string;
    line2: string;
    city: string;
    county: string;
    postalCode: string;
    country: string;
    lockerName: string | null;
  };
};

/**
 * Deterministic pseudo-barcode generator SVG
 */
function AwbBarcode({ code }: { code: string }) {
  // Generate deterministic bar widths based on char codes
  const bars: { width: number; space: number }[] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    const w1 = (c % 3) + 1;
    const s1 = ((c >> 1) % 2) + 1;
    const w2 = ((c >> 2) % 3) + 1;
    const s2 = ((c >> 3) % 2) + 1;
    bars.push({ width: w1, space: s1 });
    bars.push({ width: w2, space: s2 });
  }

  let totalWidth = 30;
  bars.forEach((b) => {
    totalWidth += b.width + b.space;
  });

  let currentX = 15;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${Math.max(totalWidth, 240)} 70`}
        className="w-full max-w-[280px] h-[55px] overflow-visible"
      >
        {/* Start guard */}
        <rect x="5" y="0" width="3" height="60" fill="black" />
        <rect x="10" y="0" width="2" height="60" fill="black" />

        {bars.map((bar, idx) => {
          const x = currentX;
          currentX += bar.width + bar.space;
          return <rect key={idx} x={x} y="0" width={bar.width} height="60" fill="black" />;
        })}

        {/* End guard */}
        <rect x={currentX + 5} y="0" width="2" height="60" fill="black" />
        <rect x={currentX + 9} y="0" width="3" height="60" fill="black" />
      </svg>
      <span className="font-mono text-sm font-black tracking-widest text-neutral-900 mt-1">
        {code}
      </span>
    </div>
  );
}

export default function PrintAwbModal({ order, isOpen, onClose }: Props) {
  const [data, setData] = useState<AwbFullData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && order) {
      setLoading(true);
      setError(null);
      fetch(`/api/seller/orders/${order.order_id}/awb`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setData(json);
          } else {
            setError(json.error || "Nu am putut încărca datele AWB.");
          }
        })
        .catch(() => setError("Eroare de conexiune la preluarea AWB-ului."))
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  const trackingNumber =
    data?.awb.trackingNumber ||
    order.order_metadata.awb_details?.awb_number ||
    order.order_metadata.tracking_number ||
    "AWB-PENDING";

  const carrierName =
    data?.awb.carrierName ||
    order.order_metadata.awb_details?.carrier ||
    order.order_metadata.shipping_method ||
    "Sameday Easybox";

  const formattedDate = new Date().toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Print styling overrides */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-awb-document,
          #printable-awb-document * {
            visibility: visible;
          }
          #printable-awb-document {
            position: fixed;
            left: 0;
            top: 0;
            width: 100vw;
            height: auto;
            margin: 0;
            padding: 16px;
            box-shadow: none !important;
            border: 2px solid #000 !important;
            background: white !important;
            z-index: 999999;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Modal Toolbar (Screen only) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50 no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-violet-100 text-violet-800">
              {carrierName}
            </span>
            <h2 className="text-base font-bold text-neutral-900">
              Etichetă AWB #{trackingNumber}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0D0D0D] hover:bg-black rounded-xl shadow transition"
            >
              <Printer size={15} />
              Tipărește AWB
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto p-4 md:p-6 flex justify-center bg-neutral-100/70">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-neutral-500 gap-3">
              <Loader2 size={32} className="animate-spin text-violet-600" />
              <p className="text-xs font-semibold">Se generează documentul de transport...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-600">
              <p className="text-sm font-bold">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-neutral-200 rounded-lg text-neutral-800"
              >
                Închide
              </button>
            </div>
          ) : (
            /* Printable AWB Document Container */
            <div
              id="printable-awb-document"
              ref={printAreaRef}
              className="bg-white text-black w-full max-w-[620px] p-6 rounded-xl border-2 border-neutral-900 shadow-md text-xs font-sans"
            >
              {/* Top Document Header */}
              <div className="border-b-2 border-neutral-900 pb-3 mb-3 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-lg tracking-wider">SWYPIK</span>
                    <span className="bg-black text-white text-[10px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                      DELIVERY
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-semibold mt-0.5">
                    Serviciu Curierat & Logistică ERP
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block border-2 border-black px-3 py-1 font-black text-xs uppercase tracking-wider rounded">
                    {carrierName}
                  </span>
                  <p className="text-[10px] text-neutral-600 mt-1">Data: {formattedDate}</p>
                </div>
              </div>

              {/* Barcode and Tracking code */}
              <div className="border-2 border-neutral-900 rounded-lg p-3 mb-4 bg-neutral-50/50 flex flex-col items-center justify-center">
                <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1">
                  COD DE BARE TRANSPORT / TRACKING
                </p>
                <AwbBarcode code={trackingNumber} />
                <p className="text-[10px] text-neutral-500 mt-1">
                  Comanda #{data?.order.orderNumber || order.order_id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {/* Sender and Receiver Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Expeditor */}
                <div className="border border-neutral-900 p-3 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="border-b border-neutral-300 pb-1 mb-2 font-black uppercase text-[11px] tracking-wider text-neutral-700">
                      1. EXPEDITOR
                    </div>
                    <p className="font-bold text-neutral-900 text-xs">
                      {data?.sender.name || "Comerciant Swypik"}
                    </p>
                    {data?.sender.cui && (
                      <p className="text-[11px] text-neutral-600">CUI: {data.sender.cui}</p>
                    )}
                    <p className="text-[11px] text-neutral-700 mt-1">
                      {data?.sender.address || "Depozit Vânzător"}
                    </p>
                    <p className="text-[11px] text-neutral-700">
                      {data?.sender.city || "București"}, {data?.sender.county || "România"}
                    </p>
                  </div>
                  <div className="mt-2 pt-1 border-t border-neutral-200 text-[10px] text-neutral-600">
                    Tel: {data?.sender.phone || "0700000000"}
                  </div>
                </div>

                {/* Destinatar */}
                <div className="border-2 border-neutral-900 p-3 rounded-lg bg-neutral-50/30 flex flex-col justify-between">
                  <div>
                    <div className="border-b border-neutral-300 pb-1 mb-2 font-black uppercase text-[11px] tracking-wider text-neutral-900 flex items-center justify-between">
                      <span>2. DESTINATAR</span>
                      <span className="text-[9px] bg-black text-white px-1.5 py-0.2 rounded font-mono">
                        PRIORITAR
                      </span>
                    </div>
                    <p className="font-black text-neutral-900 text-sm">
                      {data?.recipient.name || order.order_metadata.customer_name || "Client Swypik"}
                    </p>
                    <p className="text-xs font-black text-neutral-900 mt-0.5">
                      Tel: {data?.recipient.phone || order.order_metadata.customer_phone || "-"}
                    </p>
                    <p className="text-[11px] text-neutral-800 mt-1 font-medium">
                      {data?.recipient.line1 || order.order_metadata.shipping_address?.line1 || "Adresă livrare"}
                    </p>
                    {data?.recipient.line2 && (
                      <p className="text-[11px] text-neutral-800">{data.recipient.line2}</p>
                    )}
                    <p className="text-[11px] font-bold text-neutral-900">
                      {data?.recipient.city || order.order_metadata.shipping_address?.city || ""}{" "}
                      {data?.recipient.county ? `(${data.recipient.county})` : ""}
                      {data?.recipient.postalCode ? ` - CP ${data.recipient.postalCode}` : ""}
                    </p>

                    {/* Locker badge if applicable */}
                    {(data?.recipient.lockerName || order.order_metadata.easybox_locker) && (
                      <div className="mt-2 p-1.5 bg-violet-100 border border-violet-300 rounded text-violet-900 font-bold text-[10px]">
                        Locker: {data?.recipient.lockerName || order.order_metadata.easybox_locker}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Package Specs */}
              <div className="border border-neutral-900 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-neutral-100 border-b border-neutral-900 font-bold text-neutral-700">
                    <tr>
                      <th className="p-2 border-r border-neutral-900">Nr. Colete</th>
                      <th className="p-2 border-r border-neutral-900">Greutate</th>
                      <th className="p-2 border-r border-neutral-900">Ramburs</th>
                      <th className="p-2">Valoare Asigurată</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border-r border-neutral-900 font-bold">
                        {data?.awb.parcelsCount || 1} colet
                      </td>
                      <td className="p-2 border-r border-neutral-900 font-bold">
                        {data?.awb.weightKg || 1.0} kg
                      </td>
                      <td className="p-2 border-r border-neutral-900 font-black text-neutral-900">
                        0.00 RON (Achitat Online Card)
                      </td>
                      <td className="p-2 font-bold">
                        {data?.order.totalRon || (order.total_cents / 100).toFixed(2)} RON
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Products list summary */}
              <div className="border border-neutral-300 rounded-lg p-2.5 mb-4 bg-neutral-50/50">
                <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1">
                  Conținut Colet:
                </p>
                <div className="space-y-1">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="font-medium text-neutral-800">
                        {item.quantity}x {item.title}
                      </span>
                      <span className="font-mono text-neutral-600 font-semibold">
                        {((item.quantity * item.unit_amount_cents) / 100).toFixed(2)} RON
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes & Signatures */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t-2 border-neutral-900 text-[10px]">
                <div>
                  <p className="font-bold text-neutral-700 uppercase">Instrucțiuni Livrare:</p>
                  <p className="text-neutral-600 mt-0.5 italic">
                    {data?.awb.notes || "Manevrați cu atenție. Verificare colet la livrare."}
                  </p>
                </div>
                <div className="flex justify-between items-end text-neutral-500">
                  <div>
                    <p className="border-t border-dotted border-neutral-400 pt-1">Semnătură Predare</p>
                  </div>
                  <div>
                    <p className="border-t border-dotted border-neutral-400 pt-1">Semnătură Primire</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
