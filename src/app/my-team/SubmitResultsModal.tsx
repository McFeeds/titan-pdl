"use client";

import { useState } from "react";
import { submitMatchResults } from "./actions";

interface Props {
  matchId: number;
  weekNumber: number;
  opponentName: string;
  onClose: () => void;
}

export default function SubmitResultsModal({ matchId, weekNumber, opponentName, onClose }: Props) {
  const [urls, setUrls] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setUrl(i: number, val: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const games = urls
      .map((url, i) => ({ gameNumber: i + 1, replayUrl: url.trim() }))
      .filter((g) => g.replayUrl !== "");

    if (games.length < 2) {
      setError("Please provide replay links for at least 2 games.");
      return;
    }

    setLoading(true);
    const result = await submitMatchResults(matchId, games);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(onClose, 1200);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white">Submit Match Results</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Week {weekNumber} vs {opponentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition-colors ml-4 mt-0.5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-400">Results submitted!</p>
            <p className="text-xs text-gray-500">Stats have been updated.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Paste the Pokémon Showdown replay links below. The winner and stats will be parsed automatically.
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
                  placeholder="https://replay.pokemonshowdown.com/..."
                  required={i < 2}
                  disabled={loading}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-700 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition disabled:opacity-50"
                />
              </div>
            ))}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 text-xs font-semibold text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analyzing…
                  </>
                ) : (
                  "Submit Results"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
