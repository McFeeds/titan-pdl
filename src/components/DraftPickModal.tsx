"use client";

import { useState } from "react";
import { typeColor } from "@/lib/pokemon-types";

export interface DraftPickModalPokemon {
  id: number;
  name: string;
  dex_number: number | null;
  type_1: string;
  type_2: string | null;
  point_value: number;
}

interface Props {
  pokemon: DraftPickModalPokemon;
  mode: "draft" | "add" | "drop";
  currentSpent: number;
  pointBudget: number;
  faTokensRemaining: number | null; // null when not relevant (draft-time picks never cost a token)
  disabledReason: string | null;
  onConfirm: () => Promise<{ error: string | null }>;
  onClose: () => void;
}

const MODE_COPY: Record<Props["mode"], { title: string; confirmLabel: string }> = {
  draft: { title: "Draft this pokemon?", confirmLabel: "Draft" },
  add: { title: "Add this pokemon?", confirmLabel: "Add" },
  drop: { title: "Drop this pokemon?", confirmLabel: "Drop" },
};

function spriteUrl(n: number, large = false) {
  return large
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}

export default function DraftPickModal({
  pokemon,
  mode,
  currentSpent,
  pointBudget,
  faTokensRemaining,
  disabledReason,
  onConfirm,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<"confirm" | "submitting" | "success">("confirm");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<"large" | "small" | "ball">("large");

  const delta = mode === "drop" ? -pokemon.point_value : pokemon.point_value;
  const newSpent = currentSpent + delta;
  const overBudget = newSpent > pointBudget;

  async function handleConfirm() {
    setError(null);
    setPhase("submitting");
    const result = await onConfirm();
    if (result.error) {
      setError(result.error);
      setPhase("confirm");
      return;
    }
    setPhase("success");
    setTimeout(onClose, 900);
  }

  const isLoading = phase === "submitting";
  const { title, confirmLabel } = MODE_COPY[mode];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col">
        <div className="p-5 flex flex-col items-center gap-3">
          <div className="w-24 h-24 flex items-center justify-center">
            {pokemon.dex_number && attempt !== "ball" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attempt === "large" ? spriteUrl(pokemon.dex_number, true) : spriteUrl(pokemon.dex_number)}
                alt={pokemon.name}
                className="w-full h-full object-contain"
                onError={() => setAttempt((a) => (a === "large" ? "small" : "ball"))}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">?</div>
            )}
          </div>

          <div className="text-center">
            <p className="text-lg font-bold text-white">{pokemon.name}</p>
            <div className="flex gap-1 justify-center mt-1">
              {[pokemon.type_1, pokemon.type_2].filter(Boolean).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: typeColor(t as string) + "33", color: typeColor(t as string) }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-400">{title}</p>

          <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Points</span>
              <span className={`font-mono font-semibold ${overBudget ? "text-red-400" : "text-white"}`}>
                {currentSpent} → {newSpent}
                <span className="text-gray-500 font-normal"> / {pointBudget}</span>
              </span>
            </div>
            {faTokensRemaining !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Free agency tokens</span>
                <span className="font-mono font-semibold text-white">
                  {mode === "drop" ? faTokensRemaining : `${faTokensRemaining} → ${faTokensRemaining - 1}`}
                </span>
              </div>
            )}
          </div>

          {disabledReason && (
            <p className="text-amber-400 text-xs font-medium text-center">{disabledReason}</p>
          )}
          {error && <p className="text-red-400 text-xs font-medium text-center">{error}</p>}
          {phase === "success" && (
            <p className="text-emerald-400 text-xs font-semibold text-center">Done!</p>
          )}
        </div>

        <div className="flex border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 text-sm font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !!disabledReason || phase === "success"}
            className="flex-1 py-3 text-sm font-bold text-indigo-400 hover:text-indigo-300 border-l border-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? "Submitting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
