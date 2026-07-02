"use client";

import { useState } from "react";
import { analyzeMatchResults, submitMatchResults } from "./actions";
import type { MatchAnalysis, GameAnalysis } from "./actions";

interface Props {
  matchId: number;
  weekNumber: number;
  opponentName: string;
  onClose: () => void;
}

type Phase = "form" | "analyzing" | "confirming" | "submitting" | "success";

// ---------- Confirmation summary ----------

function TeamBlock({ team }: { team: GameAnalysis["teams"][number] }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${team.isMyTeam ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-white/[0.03] border border-white/10"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${team.isMyTeam ? "text-indigo-400" : "text-gray-500"}`}>
        {team.isMyTeam ? "My Team · " : ""}{team.teamName}
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5 items-center">
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Pokémon</span>
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider text-right">K</span>
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider text-right">D</span>
        {team.pokemon.map((p) => (
          <>
            <span key={p.name} className="text-xs text-gray-200">{p.name}</span>
            <span className={`text-xs font-mono text-right ${p.kills > 0 ? "text-emerald-400" : "text-gray-600"}`}>{p.kills}</span>
            <span className={`text-xs font-mono text-right ${p.deaths > 0 ? "text-red-400" : "text-gray-600"}`}>{p.deaths}</span>
          </>
        ))}
      </div>
    </div>
  );
}

function GameSummary({ game }: { game: GameAnalysis }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Game {game.gameNumber}</span>
        {game.winnerTeamName && (
          <>
            <span className="text-gray-700 text-[10px]">·</span>
            <span className="text-[11px] font-semibold text-emerald-400">{game.winnerTeamName} wins</span>
          </>
        )}
      </div>
      {game.teams.map((team) => (
        <TeamBlock key={team.teamName} team={team} />
      ))}
    </div>
  );
}

// ---------- Main modal ----------

export default function SubmitResultsModal({ matchId, weekNumber, opponentName, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [urls, setUrls] = useState(["", "", ""]);
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setUrl(i: number, val: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));
  }

  async function handleAnalyze() {
    setError(null);

    const games = urls
      .map((url, i) => ({ gameNumber: i + 1, replayUrl: url.trim() }))
      .filter((g) => g.replayUrl !== "");

    if (games.length < 2) {
      setError("Please provide replay links for at least 2 games.");
      return;
    }

    setPhase("analyzing");
    const result = await analyzeMatchResults(matchId, games);

    if (result.error || !result.analysis) {
      setError(result.error ?? "Unknown error");
      setPhase("form");
    } else {
      setAnalysis(result.analysis);
      setPhase("confirming");
    }
  }

  async function handleConfirm() {
    setError(null);
    setPhase("submitting");

    const games = urls
      .map((url, i) => ({ gameNumber: i + 1, replayUrl: url.trim() }))
      .filter((g) => g.replayUrl !== "");

    const result = await submitMatchResults(matchId, games);

    if (result.error) {
      setError(result.error);
      setPhase("confirming");
    } else {
      setPhase("success");
      setTimeout(onClose, 1400);
    }
  }

  const isLoading = phase === "analyzing" || phase === "submitting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Submit Match Results</h2>
            <p className="text-xs text-gray-500 mt-0.5">Week {weekNumber} vs {opponentName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-600 hover:text-gray-400 transition-colors ml-4 mt-0.5 disabled:opacity-30"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto px-6 pb-6 flex flex-col gap-4">

          {/* ── Success ── */}
          {phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-400">Results submitted!</p>
              <p className="text-xs text-gray-500">Stats have been updated.</p>
            </div>
          )}

          {/* ── URL form ── */}
          {(phase === "form" || phase === "analyzing") && (
            <form id="replay-form" onSubmit={(e) => { e.preventDefault(); handleAnalyze(); }} className="flex flex-col gap-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Paste the Pokémon Showdown replay links below. Stats will be parsed automatically — you&apos;ll review them before anything is saved.
              </p>
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Game {i + 1} Replay{i === 2 ? " (if played)" : ""}
                  </label>
                  <input
                    type="url"
                    value={urls[i]}
                    onChange={(e) => setUrl(i, e.target.value)}
                    placeholder="https://replay.pokemonshowdown.com/…"
                    required={i < 2}
                    disabled={phase === "analyzing"}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-700 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition disabled:opacity-50"
                  />
                </div>
              ))}
            </form>
          )}

          {/* ── Confirmation summary ── */}
          {(phase === "confirming" || phase === "submitting") && analysis && (
            <div className="flex flex-col gap-5">
              <p className="text-xs text-gray-500">
                Review the parsed results below. If everything looks correct, click <span className="text-white font-semibold">Confirm & Submit</span> to save.
              </p>
              {analysis.games.map((game) => (
                <GameSummary key={game.gameNumber} game={game} />
              ))}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* ── Actions ── */}
          {phase !== "success" && (
            <div className="flex gap-2 pt-1 shrink-0">
              {phase === "confirming" || phase === "submitting" ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setPhase("form"); setError(null); }}
                    disabled={phase === "submitting"}
                    className="flex-1 px-4 py-2 text-xs font-semibold text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition disabled:opacity-50"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={phase === "submitting"}
                    className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {phase === "submitting" ? (
                      <>
                        <Spinner />
                        Saving…
                      </>
                    ) : (
                      "Confirm & Submit"
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={phase === "analyzing"}
                    className="flex-1 px-4 py-2 text-xs font-semibold text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="replay-form"
                    disabled={phase === "analyzing"}
                    className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {phase === "analyzing" ? (
                      <>
                        <Spinner />
                        Analyzing…
                      </>
                    ) : (
                      "Analyze Replays →"
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
