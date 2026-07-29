"use client";

/**
 * ERP Connect Card — conecteaza Meister ERP la contul de seller Swypik.
 *
 * Flow:
 *   1. Seller introduce URL ERP + API Key (msk_...)
 *   2. Test conexiune live → arata nr. produse disponibile
 *   3. "Sincronizeaza produsele" → import catalog ERP → Swypik
 *   4. Comenzile Swypik ajung automat in ERP (fulfillment)
 */

import { useState, useEffect, useCallback } from "react";
import { Database, Plug, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface ErpStatus {
    connected: boolean;
    erp_url: string | null;
    last_sync: string | null;
}

export default function ErpConnectCard() {
    const [status, setStatus] = useState<ErpStatus>({ connected: false, erp_url: null, last_sync: null });
    const [loading, setLoading] = useState(true);
    const [erpUrl, setErpUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/seller/erp/connect");
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
                if (data.erp_url) setErpUrl(data.erp_url);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    const connect = async () => {
        if (!erpUrl || !apiKey) {
            setMessage({ type: "err", text: "URL ERP și API Key sunt obligatorii" });
            return;
        }
        setConnecting(true);
        setMessage(null);
        try {
            const res = await fetch("/api/seller/erp/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ erp_api_url: erpUrl, erp_api_key: apiKey }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setMessage({ type: "ok", text: data.message });
                setApiKey("");
                loadStatus();
            } else {
                setMessage({ type: "err", text: data.error || "Conexiune eșuată" });
            }
        } catch (e: any) {
            setMessage({ type: "err", text: e.message || "Eroare de rețea" });
        } finally { setConnecting(false); }
    };

    const disconnect = async () => {
        if (!confirm("Sigur vrei să deconectezi ERP-ul? Produsele importate rămân.")) return;
        await fetch("/api/seller/erp/connect", { method: "DELETE" });
        setMessage(null);
        loadStatus();
    };

    const syncNow = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            const res = await fetch("/api/seller/erp/sync", { method: "POST" });
            const data = await res.json();
            if (res.ok && data.success) {
                setMessage({ type: "ok", text: data.message });
                loadStatus();
            } else {
                setMessage({ type: "err", text: data.error || "Sync eșuat" });
            }
        } catch (e: any) {
            setMessage({ type: "err", text: e.message || "Eroare de rețea" });
        } finally { setSyncing(false); }
    };

    if (loading) {
        return (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
        );
    }

    return (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                        <Database className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-[#0D0D0D]">Meister ERP</h3>
                        <p className="text-xs text-neutral-500">
                            Conectează-ți ERP-ul — produsele și comenzile se sincronizează automat
                        </p>
                    </div>
                </div>
                {status.connected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conectat
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5" /> Neconectat
                    </span>
                )}
            </div>

            {message && (
                <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${message.type === "ok"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                    {message.type === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                    {message.text}
                </div>
            )}

            {status.connected ? (
                <div className="space-y-3">
                    <div className="text-sm text-neutral-600">
                        <div className="font-mono text-xs bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200">{status.erp_url}</div>
                        {status.last_sync && (
                            <p className="text-xs text-neutral-400 mt-1">
                                Ultima sincronizare: {new Date(status.last_sync).toLocaleString("ro-RO")}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={syncNow} disabled={syncing}
                            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {syncing ? "Se sincronizează..." : "Sincronizează produsele"}
                        </button>
                        <button onClick={disconnect}
                            className="px-4 py-2.5 border border-neutral-300 hover:bg-neutral-50 text-neutral-600 rounded-xl text-sm font-medium transition-colors">
                            Deconectează
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-neutral-600 block mb-1">URL ERP</label>
                        <input value={erpUrl} onChange={e => setErpUrl(e.target.value)}
                            placeholder="https://erp.firmata.ro"
                            className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600 block mb-1">API Key (din Meister ERP → Swypik Hub → API Keys)</label>
                        <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                            placeholder="msk_..."
                            className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                    <button onClick={connect} disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#0D0D0D] hover:bg-neutral-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                        {connecting ? "Se testează conexiunea..." : "Conectează ERP"}
                    </button>
                    <p className="text-xs text-neutral-400">
                        Nu ai un ERP? <a href="https://erp.meistercom.ro" target="_blank" className="text-violet-600 underline">Creează unul gratuit cu AI în 30 secunde →</a>
                    </p>
                </div>
            )}
        </div>
    );
}
