"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Trophy, Flame, Gift, Sparkles, Play, CheckCircle2, AlertCircle } from "lucide-react";
import GamePlayerModal from "@/components/gaming/GamePlayerModal";

interface GameItem {
  id: string;
  title: string;
  category: string;
  embed_url: string;
  thumbnail_url: string;
}

const ARCADE_GAMES: GameItem[] = [
  {
    id: "game_2048",
    title: "2048 Classic",
    category: "Puzzle",
    embed_url: "/games/2048/index.html",
    thumbnail_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "game_flappy",
    title: "Flappy Swyp",
    category: "Casual & Reflex",
    embed_url: "/games/flappy/index.html",
    thumbnail_url: "https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80",
  },
];

export default function GamingHubPage() {
  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [triviaQuestions, setTriviaQuestions] = useState<any[]>([]);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [triviaScore, setTriviaScore] = useState(0);
  const [triviaDone, setTriviaDone] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const [deals, setDeals] = useState<any[]>([]);
  const [freeGames, setFreeGames] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"arcade" | "trivia" | "deals">("arcade");

  useEffect(() => {
    // Load Trivia
    fetch("/api/gaming/trivia")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.questions)) {
          setTriviaQuestions(d.questions);
        }
      })
      .catch((e) => console.error("Failed to load trivia", e));

    // Load Deals
    fetch("/api/gaming/deals")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setDeals(d.deals || []);
          setFreeGames(d.freeGames || []);
        }
      })
      .catch((e) => console.error("Failed to load deals", e));
  }, []);

  const handleAnswer = (option: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(option);

    setTimeout(() => {
      setTriviaScore((s) => s + 50);
      if (triviaIndex + 1 < triviaQuestions.length) {
        setTriviaIndex((i) => i + 1);
        setSelectedAnswer(null);
      } else {
        setTriviaDone(true);
        // Trimite scorul de trivia
        fetch("/api/gaming/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: "trivia_daily",
            score: triviaScore + 50,
            durationMs: 15000,
          }),
        }).catch(() => null);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Top Banner Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/60 via-slate-900 to-slate-950 px-4 py-8 sm:px-8 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles size={14} /> Swypik Arcade & Hub
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-2">
              Gaming & <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">Recompense</span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl">
              Joacă instant mini-jocuri HTML5, participă la Daily Trivia, descoperă jocuri gratuite pe PC și acumulează XP și SWYP Coins.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-xl">
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-xs text-slate-400 uppercase font-bold">Nivel Gamer</div>
              <div className="text-2xl font-black text-amber-400">Lv. 3</div>
            </div>
            <div className="text-center px-3">
              <div className="text-xs text-slate-400 uppercase font-bold">SWYP Earning</div>
              <div className="text-2xl font-black text-emerald-400">+2.50</div>
            </div>
          </div>
        </div>

        {/* Tab-uri Navigație */}
        <div className="max-w-6xl mx-auto mt-8 flex gap-2 border-b border-slate-800/80">
          <button
            onClick={() => setActiveTab("arcade")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "arcade"
                ? "border-cyan-400 text-cyan-400 bg-cyan-400/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gamepad2 size={18} /> Mini-Jocuri Arcade
          </button>
          <button
            onClick={() => setActiveTab("trivia")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "trivia"
                ? "border-cyan-400 text-cyan-400 bg-cyan-400/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Flame size={18} /> Daily Trivia Arena
          </button>
          <button
            onClick={() => setActiveTab("deals")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "deals"
                ? "border-cyan-400 text-cyan-400 bg-cyan-400/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gift size={18} /> Jocuri Gratuite & Promoții
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {activeTab === "arcade" && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Gamepad2 className="text-cyan-400" /> Jocuri Jucabile Instant (Fără Instalare)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {ARCADE_GAMES.map((game) => (
                <div
                  key={game.id}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden shadow-lg transition duration-200"
                >
                  <div className="h-44 w-full overflow-hidden relative">
                    <img
                      src={game.thumbnail_url}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-md text-xs font-semibold text-cyan-300 border border-white/10">
                      {game.category}
                    </span>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-cyan-300 transition">
                        {game.title}
                      </h3>
                      <p className="text-xs text-slate-400">Câștigă XP și SWYP Coins</p>
                    </div>
                    <button
                      onClick={() => setActiveGame(game)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl shadow-md transition"
                    >
                      <Play size={16} fill="currentColor" /> Joacă
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "trivia" && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            {!triviaDone && triviaQuestions.length > 0 ? (
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                  <span>Întrebarea {triviaIndex + 1} din {triviaQuestions.length}</span>
                  <span className="text-amber-400 font-extrabold flex items-center gap-1">
                    <Trophy size={14} /> Scor: {triviaScore} pct
                  </span>
                </div>

                <div className="w-full bg-slate-800 h-2 rounded-full mb-6 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full transition-all duration-300"
                    style={{ width: `${((triviaIndex + 1) / triviaQuestions.length) * 100}%` }}
                  />
                </div>

                <div className="text-xs text-cyan-400 font-semibold mb-2">
                  {triviaQuestions[triviaIndex].category} · {triviaQuestions[triviaIndex].difficulty}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-6">
                  {triviaQuestions[triviaIndex].question}
                </h3>

                <div className="space-y-3">
                  {triviaQuestions[triviaIndex].options.map((option: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(option)}
                      className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition ${
                        selectedAnswer === option
                          ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                          : "bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-200"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Trophy size={48} className="mx-auto text-amber-400 mb-4 animate-bounce" />
                <h3 className="text-2xl font-bold text-white mb-2">Quiz Completat cu Succes!</h3>
                <p className="text-slate-400 mb-6">
                  Ai obținut <strong className="text-white">{triviaScore} puncte</strong> și ai primit recompensa de SWYP Coins!
                </p>
                <button
                  onClick={() => {
                    setTriviaIndex(0);
                    setTriviaScore(0);
                    setTriviaDone(false);
                    setSelectedAnswer(null);
                  }}
                  className="px-6 py-3 bg-cyan-500 text-slate-950 font-bold rounded-xl hover:bg-cyan-400 transition"
                >
                  Joacă din nou
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "deals" && (
          <div className="space-y-10">
            {/* Free games */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Gift className="text-emerald-400" /> Jocuri Gratuite (FreeToGame API)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {freeGames.map((fg) => (
                  <a
                    key={fg.id}
                    href={fg.game_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-emerald-500/40 transition block group"
                  >
                    <img src={fg.thumbnail} alt={fg.title} className="w-full h-32 object-cover" />
                    <div className="p-3">
                      <div className="text-xs text-emerald-400 font-semibold mb-1">100% GRATUIT</div>
                      <h4 className="font-bold text-sm text-white group-hover:text-emerald-300 transition truncate">
                        {fg.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1">{fg.short_description}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Deals */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Flame className="text-rose-400" /> Reduceri Masive (CheapShark API)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {deals.map((d) => (
                  <div
                    key={d.dealID}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3 hover:border-rose-500/40 transition"
                  >
                    <img src={d.thumb} alt={d.title} className="w-16 h-12 object-cover rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-white truncate">{d.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-emerald-400 font-bold text-sm">${d.salePrice}</span>
                        <span className="text-xs text-slate-500 line-through">${d.normalPrice}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                          -{Math.round(Number(d.savings))}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Iframe Sandbox */}
      <GamePlayerModal game={activeGame} onClose={() => setActiveGame(null)} />
    </div>
  );
}
