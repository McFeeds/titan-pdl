"use client";

import { useState } from "react";
import { submitPlayoffResult } from "./playoffActions";
import type { BracketTeam } from "./types";

type Phase = "form" | "submitting" | "success";

interface Props {
  seasonId: number;
  round: number;
  matchIndex: number;
  teamA: BracketTeam;
  teamB: BracketTeam;
  onClose: () => void;
}

export default function PlayoffResultModal({ seasonId, round, matchIndex, teamA, teamB, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [replayUrls, setReplayUrls] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);

  function setUrl(i: number, val: string) {
    setReplayUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));
  }

  async function handleSubmit() {
    if (!winnerId) {
      setError("Pick which team won.");
      return;
    }
    setError(null);
    setPhase("submitting");

    const fd = new FormData();
    fd.append("season_id", String(seasonId));
    fd.append("round", String(round));
    fd.append("match_index", String(matchIndex));
    fd.append("winner_team_id", String(winnerId));
    for (const url of replayUrls) {
      if (url.trim()) fd.append("replay_url", url.trim());
    }

    const result = await submitPlayoffResult(null, fd);
    if (result?.error) {
      setError(result.error);
      setPhase("form");
    } else {
      setPhase("success");
      setTimeout(onClose, 1400);
    }
  }

  const isLoading = phase === "submitting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 shrink-0">
          <h2 className="text-base font-bold text-white">Submit Playoff Result</h2>
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

        <div className="overflow-y-auto px-6 pb-6 flex flex-col gap-4">
          {phase === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-400">Result submitted!</p>
              <p className="text-xs text-gray-500">The bracket has been updated.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                  Who won?
                </label>
                <div className="flex flex-col gap-2">
                  {[teamA, teamB].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWinnerId(t.id)}
                      disabled={isLoading}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm font-semibold transition-colors disabled:opacity-50 ${
                        winnerId === t.id
                          ? "bg-indigo-600/20 border-indigo-500 text-white"
                          : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      {t.team_name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                  Replay links (optional)
                </label>
                <div className="flex flex-col gap-2">
                  {replayUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(i, e.target.value)}
                        placeholder="https://replay.pokemonshowdown.com/…"
                        disabled={isLoading}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-700 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition disabled:opacity-50"
                      />
                      {replayUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setReplayUrls((prev) => prev.filter((_, idx) => idx !== i))}
                          disabled={isLoading}
                          className="text-gray-600 hover:text-red-400 text-xs shrink-0 disabled:opacity-50"
                          aria-label="Remove replay link"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setReplayUrls((prev) => [...prev, ""])}
                    disabled={isLoading}
                    className="text-xs text-indigo-400 hover:text-indigo-300 self-start disabled:opacity-50"
                  >
                    + Add another replay
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50"
                >
                  {isLoading ? "Saving…" : "Submit Result"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
