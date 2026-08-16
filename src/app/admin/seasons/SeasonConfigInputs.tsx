"use client";

import { useState, useTransition } from "react";
import { updateSeasonConfig } from "./actions";
import type { MatchFormat } from "@/types/database";

const inputCls =
  "w-16 px-1.5 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500";
const selectCls =
  "px-1.5 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 [&>option]:bg-[#0d0d1f]";

export default function SeasonConfigInputs({
  id,
  pointBudget,
  faTokens,
  matchFormat,
}: {
  id: number;
  pointBudget: number;
  faTokens: number;
  matchFormat: MatchFormat;
}) {
  const [budget, setBudget] = useState(pointBudget);
  const [tokens, setTokens] = useState(faTokens);
  const [format, setFormat] = useState(matchFormat);
  const [pending, startTransition] = useTransition();

  function save(nextBudget: number, nextTokens: number, nextFormat: MatchFormat) {
    startTransition(async () => {
      await updateSeasonConfig(id, nextBudget, nextTokens, nextFormat);
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        Budget
        <input
          type="number"
          value={budget}
          disabled={pending}
          onChange={(e) => setBudget(Number(e.target.value))}
          onBlur={() => save(budget, tokens, format)}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        FA Tokens
        <input
          type="number"
          value={tokens}
          disabled={pending}
          onChange={(e) => setTokens(Number(e.target.value))}
          onBlur={() => save(budget, tokens, format)}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        Format
        <select
          value={format}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as MatchFormat;
            setFormat(next);
            save(budget, tokens, next);
          }}
          className={selectCls}
        >
          <option value="bo3">Bo3</option>
          <option value="singles_doubles">Singles + Doubles</option>
        </select>
      </label>
    </div>
  );
}
