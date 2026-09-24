"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Gamepad2, Trophy, Flame, Gift, Sparkles, Play, LogIn, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";
import GamePlayerModal from "@/components/gaming/GamePlayerModal";

interface GameItem {
  id: string;
  title: string;
  category: string;
  embed_url: string;
  thumbnail_url: string;
}

interface TriviaQuestion {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  options: string[];
}

interface Profile {
  level: number;
  xp: number;
}

interface FreeGameItem {
  id: number;
  title: string;
  thumbnail: string;
  short_description: string;
  game_url: string;
}

interface DealItem {
  dealID: string;
  title: string;
  thumb: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
}

type LoadState = "idle" | "loading" | "ready" | "error" | "unauthorized";

export default function GamingHubClient() {
  const t = useTranslations("gaming");

  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [games, setGames] = useState<GameItem[]>([]);
  const [gamesState, setGamesState] = useState<LoadState>("idle");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileState, setProfileState] = useState<LoadState>("idle");

  const [roundToken, setRoundToken] = useState<string | null>(null);
  const [triviaQuestions, setTriviaQuestions] = useState<TriviaQuestion[]>([]);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [triviaResult, setTriviaResult] = useState<{ score: number; correctCount: number; totalQuestions: number } | null>(null);
  const [triviaState, setTriviaState] = useState<LoadState>("idle");

  const [deals, setDeals] = useState<DealItem[]>([]);
  const [freeGames, setFreeGames] = useState<FreeGameItem[]>([]);
  const [dealsState, setDealsState] = useState<LoadState>("idle");
  const [activeTab, setActiveTab] = useState<"arcade" | "trivia" | "deals">("arcade");

  const loadGames = useCallback(() => {
    setGamesState("loading");
    fetch("/api/gaming/games")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setGames(d.games || []);
          setGamesState("ready");
        } else {
          setGamesState("error");
        }
      })
      .catch((e) => {
        logger.warn({ err: e }, "[gaming] failed to load games");
        setGamesState("error");
      });
  }, []);

  const loadProfile = useCallback(() => {
    setProfileState("loading");
    fetch("/api/gaming/profile")
      .then(async (r) => {
        if (r.status === 401) {
          setProfileState("unauthorized");
          return;
        }
        const d = await r.json();
        if (d.ok) {
          setProfile({ level: d.level, xp: d.xp });
          setProfileState("ready");
        } else {
          setProfileState("error");
        }
      })
      .catch((e) => {
        logger.warn({ err: e }, "[gaming] failed to load profile");
        setProfileState("error");
      });
  }, []);

  const loadTrivia = useCallback(() => {
    setTriviaState("loading");
    setTriviaResult(null);
    setTriviaIndex(0);
    setSelectedAnswers({});
    fetch("/api/gaming/trivia")
      .then(async (r) => {
        if (r.status === 401) {
          setTriviaState("unauthorized");
          return;
        }
        const d = await r.json();
        if (d.ok) {
          setTriviaQuestions(d.questions || []);
          setRoundToken(d.roundToken);
          setTriviaState("ready");
        } else {
          setTriviaState("error");
        }
      })
      .catch((e) => {
        logger.warn({ err: e }, "[gaming] failed to load trivia");
        setTriviaState("error");
      });
  }, []);

  const loadDeals = useCallback(() => {
    setDealsState("loading");
    fetch("/api/gaming/deals")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setDeals(d.deals || []);
          setFreeGames(d.freeGames || []);
          setDealsState("ready");
        } else {
          setDealsState("error");
        }
      })
      .catch((e) => {
        logger.warn({ err: e }, "[gaming] failed to load deals");
        setDealsState("error");
      });
  }, []);

  useEffect(() => {
    loadGames();
    loadProfile();
    loadTrivia();
    loadDeals();
  }, [loadGames, loadProfile, loadTrivia, loadDeals]);

  const handleAnswer = (questionId: string, option: string) => {
    if (selectedAnswers[questionId]) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: option }));

    setTimeout(async () => {
      if (triviaIndex + 1 < triviaQuestions.length) {
        setTriviaIndex((i) => i + 1);
        return;
      }
      // Last question answered — submit the whole round for server-side grading.
      if (!roundToken) return;
      try {
        const answers = triviaQuestions.map((q) => ({
          questionId: q.id,
          answer: q.id === questionId ? option : selectedAnswers[q.id],
        }));
        const res = await fetch("/api/gaming/trivia/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundToken, answers }),
        });
        const data = await res.json();
        if (data.ok) {
          setTriviaResult({ score: data.score, correctCount: data.correctCount, totalQuestions: data.totalQuestions });
          loadProfile();
        }
      } catch (e) {
        logger.warn({ err: e }, "[gaming] trivia submit failed");
      }
    }, 800);
  };

  const currentQuestion = triviaQuestions[triviaIndex];
  const selectedForCurrent = currentQuestion ? selectedAnswers[currentQuestion.id] : undefined;

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={{ paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom, 0px)))" }}
    >
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/60 via-slate-900 to-slate-950 px-4 py-8 sm:px-8 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles size={14} /> {t("badge")}
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-2">
              {t("titlePrefix")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">{t("titleHighlight")}</span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl">{t("subtitleV2")}</p>
          </div>

          {profileState === "ready" && profile && (
            <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-xl">
              <div className="text-center px-3">
                <div className="text-xs text-slate-400 uppercase font-bold">{t("levelLabel")}</div>
                <div className="text-2xl font-black text-amber-400">{t("levelValue", { level: profile.level })}</div>
              </div>
            </div>
          )}
          {profileState === "unauthorized" && (
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-4 py-3 rounded-2xl shadow-xl text-sm text-slate-300">
              <LogIn size={16} className="text-cyan-400" /> {t("signInPrompt")}
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto mt-6 flex gap-2 border-b border-slate-800/80 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setActiveTab("arcade")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "arcade" ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gamepad2 size={18} /> {t("tabArcade")}
          </button>
          <button
            onClick={() => setActiveTab("trivia")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "trivia" ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Flame size={18} /> {t("tabTrivia")}
          </button>
          <button
            onClick={() => setActiveTab("deals")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === "deals" ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gift size={18} /> {t("tabDeals")}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {activeTab === "arcade" && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Gamepad2 className="text-cyan-400" /> {t("arcadeHeading")}
            </h2>
            {gamesState === "error" && (
              <div className="text-center py-10 text-slate-400">
                <p className="mb-3">{t("arcadeError")}</p>
                <button onClick={loadGames} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold">
                  <RefreshCw size={14} /> {t("retry")}
                </button>
              </div>
            )}
            {gamesState === "ready" && games.length === 0 && <p className="text-slate-400">{t("arcadeEmpty")}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl overflow-hidden shadow-lg transition duration-200"
                >
                  <div className="h-44 w-full overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external thumbnail hosts, next/image domain allowlist not desired here */}
                    <img
                      src={game.thumbnail_url}
                      alt={game.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-md text-xs font-semibold text-cyan-300 border border-white/10">
                      {game.category}
                    </span>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-cyan-300 transition">{game.title}</h3>
                      <p className="text-xs text-slate-400">{t("arcadeRewardHintV2")}</p>
                    </div>
                    <button
                      onClick={() => setActiveGame(game)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl shadow-md transition"
                    >
                      <Play size={16} fill="currentColor" /> {t("play")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "trivia" && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            {triviaState === "unauthorized" && (
              <div className="text-center py-8 text-slate-300">
                <LogIn size={40} className="mx-auto text-cyan-400 mb-4" />
                <p>{t("signInPrompt")}</p>
              </div>
            )}
            {triviaState === "error" && (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-3">{t("triviaError")}</p>
                <button onClick={loadTrivia} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold">
                  <RefreshCw size={14} /> {t("retry")}
                </button>
              </div>
            )}
            {triviaState === "ready" && !triviaResult && currentQuestion ? (
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                  <span>{t("questionOf", { current: triviaIndex + 1, total: triviaQuestions.length })}</span>
                  <span className="text-amber-400 font-extrabold flex items-center gap-1">
                    <Trophy size={14} /> {t("trophyLabel")}
                  </span>
                </div>

                <div className="w-full bg-slate-800 h-2 rounded-full mb-6 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full transition-all duration-300"
                    style={{ width: `${((triviaIndex + 1) / triviaQuestions.length) * 100}%` }}
                  />
                </div>

                <div className="text-xs text-cyan-400 font-semibold mb-2">
                  {currentQuestion.category} · {currentQuestion.difficulty}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-6">{currentQuestion.question}</h3>

                <div className="space-y-3">
                  {currentQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(currentQuestion.id, option)}
                      className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition ${
                        selectedForCurrent === option
                          ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                          : "bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-200"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : triviaState === "ready" && triviaResult ? (
              <div className="text-center py-8">
                <Trophy size={48} className="mx-auto text-amber-400 mb-4 animate-bounce" />
                <h3 className="text-2xl font-bold text-white mb-2">{t("triviaCompleteTitle")}</h3>
                <p className="text-slate-400 mb-6">
                  {t("triviaCompleteBody", { correct: triviaResult.correctCount, total: triviaResult.totalQuestions, score: triviaResult.score })}
                </p>
                <button onClick={loadTrivia} className="px-6 py-3 bg-cyan-500 text-slate-950 font-bold rounded-xl hover:bg-cyan-400 transition">
                  {t("playAgain")}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "deals" && (
          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Gift className="text-emerald-400" /> {t("freeGamesHeading")}
              </h2>
              {dealsState === "error" && (
                <div className="text-center py-6">
                  <p className="text-slate-400 mb-3">{t("dealsError")}</p>
                  <button onClick={loadDeals} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold">
                    <RefreshCw size={14} /> {t("retry")}
                  </button>
                </div>
              )}
              {dealsState === "ready" && freeGames.length === 0 && <p className="text-slate-400">{t("dealsEmpty")}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {freeGames.map((fg) => (
                  <a
                    key={fg.id}
                    href={fg.game_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-emerald-500/40 transition block group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external thumbnail host */}
                    <img src={fg.thumbnail} alt={fg.title} loading="lazy" className="w-full h-32 object-cover" />
                    <div className="p-3">
                      <div className="text-xs text-emerald-400 font-semibold mb-1">{t("free100")}</div>
                      <h4 className="font-bold text-sm text-white group-hover:text-emerald-300 transition truncate">{fg.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-1">{fg.short_description}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Flame className="text-rose-400" /> {t("dealsHeading")}
              </h2>
              {dealsState === "ready" && deals.length === 0 && <p className="text-slate-400">{t("dealsEmpty")}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {deals.map((d) => (
                  <div
                    key={d.dealID}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3 hover:border-rose-500/40 transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external thumbnail host */}
                    <img src={d.thumb} alt={d.title} loading="lazy" className="w-16 h-12 object-cover rounded-lg" />
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

      <GamePlayerModal game={activeGame} onClose={() => setActiveGame(null)} onScoreChanged={loadProfile} />
    </div>
  );
}
