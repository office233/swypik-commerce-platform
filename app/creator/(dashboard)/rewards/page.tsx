"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";

interface Wallet {
  balance_points: number;
  locked_points: number;
  lifetime_earned: number;
}

interface RewardEvent {
  id: string;
  action: string;
  points_awarded: number;
  description: string;
  created_at: string;
  transaction_id?: string;
}

const REWARD_RULE_KEYS = [
  { action: "daily_login", points: 10, key: "ruleDailyLogin" },
  { action: "first_video_upload", points: 100, key: "ruleFirstVideo" },
  { action: "video_approved", points: 50, key: "ruleVideoApproved" },
  { action: "reach_1000_views", points: 200, key: "rule1000Views" },
  { action: "first_sale", points: 500, key: "ruleFirstSale" },
] as const;

export default function RewardsPage() {
  const t = useTranslations("creatorRewards");
  const rewardRules = useMemo(
    () => REWARD_RULE_KEYS.map((r) => ({ action: r.action, points: r.points, description: t(r.key) })),
    [t],
  );
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<RewardEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRewardsData = async () => {
      try {
        const [walletRes, historyRes] = await Promise.all([
          fetch("/api/rewards/wallet"),
          fetch("/api/rewards/history"),
        ]);
        
        if (walletRes.ok) {
          const walletData = await walletRes.json();
          setWallet(walletData);
        }
        
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistory(historyData.events || []);
        }
      } catch (error) {
        console.error("Error fetching rewards data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRewardsData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0D0D0D]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-[#0D0D0D]">{t("titlu")}</h1>
        <p className="text-[#6E6E80] mt-2">{t("intro")}</p>
      </div>

      {/* Hero Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm flex flex-col justify-center">
          <p className="text-sm font-bold text-[#6E6E80] mb-2">{t("balantaSwyp")}</p>
          <div className="text-4xl font-black text-[#0D0D0D] flex items-center gap-2">
            <span>🏆</span>
            <span>{wallet?.balance_points || 0}</span>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm flex flex-col justify-center relative group">
          <div className="flex justify-between items-start">
            <p className="text-sm font-bold text-[#6E6E80] mb-2 flex items-center gap-1">
              <span>🔒</span> {t("puncteBlocate")}
            </p>
            <div className="hidden group-hover:block absolute top-10 left-0 bg-[#0D0D0D] text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10 w-48 text-center">
              {t("deblocareInfo")}
            </div>
          </div>
          <div className="text-3xl font-black text-[#F59E0B]">
            {wallet?.locked_points || 0}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm flex flex-col justify-center">
          <p className="text-sm font-bold text-[#6E6E80] mb-2">{t("lifetime")}</p>
          <div className="text-3xl font-black text-[#0D0D0D]">
            {wallet?.lifetime_earned || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* History Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-[#E5E5E5]">
            <h2 className="text-xl font-bold text-[#0D0D0D]">{t("istoricTitlu")}</h2>
          </div>
          <div className="overflow-x-auto">
            {history.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
                    <th className="p-4 text-xs font-bold text-[#6E6E80] uppercase tracking-wider">{t("thData")}</th>
                    <th className="p-4 text-xs font-bold text-[#6E6E80] uppercase tracking-wider">{t("thActiune")}</th>
                    <th className="p-4 text-xs font-bold text-[#6E6E80] uppercase tracking-wider">{t("thPuncte")}</th>
                    <th className="p-4 text-xs font-bold text-[#6E6E80] uppercase tracking-wider">{t("thMotiv")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {history.map((event) => {
                    const date = new Date(event.created_at).toLocaleDateString('ro-RO', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    
                    let badgeClass = "bg-neutral-100 text-neutral-900";
                    let prefix = "+";
                    let icon = "";
                    
                    if (event.points_awarded < 0) {
                      badgeClass = "bg-red-100 text-red-800";
                      prefix = "";
                    }
                    
                    if (event.description?.toLowerCase().includes("lock") || event.action.includes("lock")) {
                      badgeClass = "bg-yellow-100 text-yellow-800";
                      icon = "🔒 ";
                    }

                    return (
                      <tr key={event.id} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="p-4 text-sm text-[#6E6E80] whitespace-nowrap">{date}</td>
                        <td className="p-4 text-sm font-medium text-[#0D0D0D]">{event.action}</td>
                        <td className="p-4 text-sm">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${badgeClass}`}>
                            {icon}{prefix}{event.points_awarded}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-[#6E6E80]">{event.description || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-[#6E6E80]">
                {t("emptyIstoric")}
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm flex flex-col h-fit">
          <div className="p-6 border-b border-[#E5E5E5] bg-[#F7F7F8] rounded-t-2xl">
            <h2 className="text-lg font-bold text-[#0D0D0D]">{t("cumCastigi")}</h2>
          </div>
          <div className="p-6 space-y-4">
            {rewardRules.map((rule, idx) => (
              <div key={idx} className="flex justify-between items-center pb-4 border-b border-[#E5E5E5] last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-bold text-[#0D0D0D]">{rule.description}</p>
                  <p className="text-xs text-[#6E6E80] font-mono mt-1">{rule.action}</p>
                </div>
                <div className="font-black text-[#0D0D0D] bg-[#0D0D0D]/10 px-2 py-1 rounded text-sm">
                  +{rule.points}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
