"use client";

import { useMemo, useState } from "react";
import { typeColor } from "@/lib/pokemon-types";
import type { KillLeaderRow } from "./types";

function spriteUrl(n: number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}

type SortKey = "kills" | "deaths" | "brought" | "kd";

export default function KillLeadersTable({ rows }: { rows: KillLeaderRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("kills");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const kd = (r: KillLeaderRow) => (r.deaths > 0 ? r.kills / r.deaths : r.kills);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.pokemon_name.toLowerCase().includes(q) ||
        r.team_name.toLowerCase().includes(q) ||
        r.type_1.toLowerCase().includes(q) ||
        (r.type_2 ?? "").toLowerCase().includes(q) ||
        (r.conference_name ?? "").toLowerCase().includes(q) ||
        (r.group_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = sortKey === "kd" ? kd(a) : a[sortKey];
      const bv = sortKey === "kd" ? kd(b) : b[sortKey];
      if (bv !== av) return (av - bv) * sortDir;
      return a.pokemon_name.localeCompare(b.pokemon_name);
    });
  }, [filtered, sortKey, sortDir]);

  const headerCls = (key: SortKey) =>
    `px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-white ${
      sortKey === key ? "text-indigo-400" : "text-gray-500"
    }`;

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === -1 ? " ↓" : " ↑") : "");

  return (
    <div className="bg-[#0d0d20] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-bold text-white">Kill Leaders</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by pokemon, team, type, group..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 w-64 max-w-full"
        />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-600 italic">No stats recorded yet this season.</p>
      ) : sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-600 italic">No pokemon match &quot;{search}&quot;.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <th className="px-4 py-2 w-8">#</th>
                <th className="px-2 py-2">Pokemon</th>
                <th className="px-2 py-2">Team</th>
                <th className="px-2 py-2">Group</th>
                <th className={headerCls("brought")} onClick={() => handleSort("brought")}>
                  GP{arrow("brought")}
                </th>
                <th className={headerCls("kills")} onClick={() => handleSort("kills")}>
                  Kills{arrow("kills")}
                </th>
                <th className={headerCls("deaths")} onClick={() => handleSort("deaths")}>
                  Deaths{arrow("deaths")}
                </th>
                <th className={headerCls("kd")} onClick={() => handleSort("kd")}>
                  K/D{arrow("kd")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={`${r.team_id}-${r.pokemon_id}`}
                  className={`border-t border-white/5 ${i % 2 === 1 ? "bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.dex_number != null && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={spriteUrl(r.dex_number)}
                          alt=""
                          className="w-8 h-8 shrink-0"
                          style={{ imageRendering: "pixelated" }}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-gray-200 text-xs font-medium truncate">{r.pokemon_name}</div>
                        <div className="flex gap-1 mt-0.5">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase"
                            style={{ backgroundColor: typeColor(r.type_1) }}
                          >
                            {r.type_1}
                          </span>
                          {r.type_2 && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase"
                              style={{ backgroundColor: typeColor(r.type_2) }}
                            >
                              {r.type_2}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-gray-300 text-xs truncate max-w-[160px]">{r.team_name}</td>
                  <td className="px-2 py-2.5 text-gray-500 text-xs truncate max-w-[140px]">
                    {[r.conference_name, r.group_name].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono text-xs text-gray-300">{r.brought}</td>
                  <td className="px-2 py-2.5 text-center font-mono text-xs font-semibold text-emerald-400">
                    {r.kills}
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono text-xs font-semibold text-red-400">
                    {r.deaths}
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono text-xs text-gray-400">
                    {r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : r.kills > 0 ? "∞" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
