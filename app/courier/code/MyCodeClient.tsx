"use client";

/**
 * „Codul meu" — ecranul de recrutare clienți al șoferului/curierului.
 * Codul personal + QR + share. Clienții noi cu codul: primele 3 curse −50%.
 * Șoferul: 5 RON la prima cursă a clientului + 2% din cursele lui 6 luni.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Check, Share2, Users, Wallet } from "lucide-react";
import Link from "next/link";

type CodeData = {
    code: string;
    share_url: string;
    stats: {
        total_referred: number;
        active_referred: number;
        total_earned_cents: number;
    };
    terms: { discount_pct: number; discounted_rides: number; first_ride_bonus_cents: number };
};

export default function MyCodeClient() {
    const [data, setData] = useState<CodeData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        fetch("/api/couriers/my-code")
            .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "error");
                return r.json();
            })
            .then(setData)
            .catch((e: Error) => setError(e.message));
    }, []);

    useEffect(() => {
        if (data?.share_url && canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, data.share_url, {
                width: 220,
                margin: 1,
                color: { dark: "#111111", light: "#FFFFFF" },
            }).catch(() => { });
        }
    }, [data]);

    const copy = async () => {
        if (!data) return;
        try {
            await navigator.clipboard.writeText(data.share_url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard indisponibil */
        }
    };

    const share = async () => {
        if (!data) return;
        if (navigator.share) {
            navigator
                .share({
                    title: "Swypik",
                    text: `Primele ${data.terms.discounted_rides} curse la jumătate de preț pe Swypik Go — folosește codul meu ${data.code}`,
                    url: data.share_url,
                })
                .catch(() => { });
        } else {
            copy();
        }
    };

    return (
        <div className="mx-auto min-h-screen max-w-md bg-white px-5 pb-16 pt-6 text-[#111]">
            <div className="mb-6 flex items-center gap-3">
                <Link href="/courier" className="rounded-full p-2 hover:bg-neutral-100" aria-label="Înapoi">
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-xl font-extrabold">Codul meu</h1>
            </div>

            {error === "not_approved" && (
                <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                    Codul devine disponibil după aprobarea contului tău.
                </p>
            )}
            {error && error !== "not_approved" && (
                <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                    Nu am putut încărca codul. Reîncearcă.
                </p>
            )}

            {data && (
                <>
                    <div className="rounded-3xl border border-neutral-200 p-6 text-center shadow-sm">
                        <p className="text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
                            Codul tău de invitație
                        </p>
                        <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.3em]">{data.code}</p>
                        <div className="mt-5 flex justify-center">
                            <canvas ref={canvasRef} className="rounded-xl" />
                        </div>
                        <p className="mt-4 text-[13px] leading-relaxed text-neutral-600">
                            Clienții tăi primesc primele {data.terms.discounted_rides} curse la −
                            {data.terms.discount_pct}%. Tu primești{" "}
                            {(data.terms.first_ride_bonus_cents / 100).toFixed(0)} lei la prima lor cursă și 2%
                            din cursele lor timp de 6 luni.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                onClick={copy}
                                className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-300 px-4 py-3 text-sm font-bold"
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? "Copiat" : "Copiază link"}
                            </button>
                            <button
                                onClick={share}
                                className="flex items-center justify-center gap-2 rounded-2xl bg-[#111] px-4 py-3 text-sm font-bold text-white"
                            >
                                <Share2 size={16} /> Trimite
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 rounded-3xl border border-neutral-200 p-5">
                        <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
                            <Users size={17} /> Clienții mei
                        </h2>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums">{data.stats.total_referred}</p>
                                <p className="text-[12px] font-semibold text-neutral-500">Total aduși</p>
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums">{data.stats.active_referred}</p>
                                <p className="text-[12px] font-semibold text-neutral-500">Activi</p>
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums">
                                    {(data.stats.total_earned_cents / 100).toFixed(0)}
                                    <span className="text-sm font-bold"> lei</span>
                                </p>
                                <p className="text-[12px] font-semibold text-neutral-500">Câștigați</p>
                            </div>
                        </div>
                        <Link
                            href="/courier/earnings"
                            className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-bold"
                        >
                            <Wallet size={16} /> Vezi câștigurile
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}
