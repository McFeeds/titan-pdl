"use client";

import { useState, useTransition } from "react";
import { updateSeasonConfig } from "./actions";

const inputCls =
  "w-16 px-1.5 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function SeasonConfigInputs({
  id,
  pointBudget,
  faTokens,
}: {
  id: number;
  pointBudget: number;
  faTokens: number;
}) {
  const [budget, setBudget] = useState(pointBudget);
  const [tokens, setTokens] = useState(faTokens);
  const [pending, startTransition] = useTransition();

  function save(nextBudget: number, nextTokens: number) {
    startTransition(async () => {
      await updateSeasonConfig(id, nextBudget, nextTokens);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        Budget
        <input
          type="number"
          value={budget}
          disabled={pending}
          onChange={(e) => setBudget(Number(e.target.value))}
          onBlur={() => save(budget, tokens)}
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
          onBlur={() => save(budget, tokens)}
          className={inputCls}
        />
      </label>
    </div>
  );
}
