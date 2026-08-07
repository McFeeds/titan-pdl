"use client";

import { createClient } from "@/lib/supabase/client";
import { computeOnClockTeamId, DRAFT_SLOT_COUNT, GO_TO_DRAFT_POOL_EVENT } from "@/lib/draft";
import { getEffectiveness, POKEMON_TYPES, TYPE_COLORS } from "@/lib/pokemon-types";
import { Conference, PokemonWithMoves } from "@/types/database";
import { addFreeAgent, submitDraftPick } from "@/lib/roster-actions";
import DraftPickModal from "@/components/DraftPickModal";
import PokemonSearchList, { type SearchablePokemon } from "@/components/PokemonSearchList";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// Diagonal split gradient per conference, matching the paired game versions
const CONFERENCE_THEMES: Record<string, { gradient: string; shadow: string }> = {
  hoenn: {
    // Ruby (deep red) → Sapphire (deep blue), top-left to bottom-right
    gradient: "linear-gradient(135deg, #7A1010 50%, #10107A 50%)",
    shadow: "0 10px 25px rgba(70, 10, 70, 0.4)",
  },
  sinnoh: {
    // Diamond (icy blue) → Pearl (soft rose), top-left to bottom-right
    gradient: "linear-gradient(135deg, #d3d8f1 50%, #fdf0ee 50%)",
    shadow: "0 10px 25px rgba(80, 100, 150, 0.4)",
  },
};

function getConferenceTheme(name: string) {
  return (
    CONFERENCE_THEMES[name.toLowerCase()] ?? {
      gradient: "#4f46e5",
      shadow: "0 10px 15px rgba(99, 102, 241, 0.2)",
    }
  );
}

const STAT_ALIASES: Record<string, string> = {
  hp: "hp", health: "hp",
  attack: "atk", atk: "atk",
  defense: "def", def: "def", defence: "def",
  "special attack": "spa", spatk: "spa", spa: "spa",
  "special defense": "spd", spdef: "spd", spd: "spd", "special defence": "spd",
  speed: "spe", spe: "spe",
  points: "point_value", pts: "point_value", point: "point_value",
};

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "point_value";

function findStat(str: string): StatKey | null {
  const n = str.toLowerCase().trim();
  if (STAT_ALIASES[n]) return STAT_ALIASES[n] as StatKey;
  for (const [alias, stat] of Object.entries(STAT_ALIASES)) {
    if (n.startsWith(alias)) return stat as StatKey;
  }
  return null;
}

function buildClauseFilter(
  query: string,
  allPokemon: PokemonWithMoves[]
): (p: PokemonWithMoves) => boolean {
  if (!query.trim()) return () => true;
  const q = query.toLowerCase();
  const filters: ((p: PokemonWithMoves) => boolean)[] = [];

  // Detect known move names first so their words don't bleed into the type filter.
  // e.g. "Ice Spinner" must not trigger the Ice type filter.
  const allMoves = new Set<string>();
  allPokemon.forEach((p) => p.moves.forEach((m) => allMoves.add(m.name.toLowerCase())));
  const matchedMoves = [...allMoves]
    .sort((a, b) => b.length - a.length)
    .filter((m) =>
      new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q)
    );
  // Strip matched move names so type detection doesn't see words like "ice" inside them
  let qForTypes = q;
  for (const move of matchedMoves) {
    qForTypes = qForTypes.replace(
      new RegExp(`\\b${move.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      ""
    );
  }

  // Resistance filter: "resists X", "immune to X", "weak to X"
  // Run this first so we can exclude these types from the plain type filter below
  const resistClaimedTypes = new Set<string>();
  const resistPattern = /(?:(resists?|immune to|not affected by|weak(?:ness)?(?:\s+to)?)\s+)([\w]+)/gi;
  let resistMatch;
  while ((resistMatch = resistPattern.exec(qForTypes)) !== null) {
    const keyword = resistMatch[1].toLowerCase();
    const typeName = resistMatch[2].toLowerCase();
    if (!POKEMON_TYPES.includes(typeName)) continue;
    resistClaimedTypes.add(typeName);
    const t = typeName;
    if (keyword.startsWith("immune") || keyword.includes("not affected")) {
      filters.push((p) => getEffectiveness(t, p.type_1, p.type_2) === 0);
    } else if (keyword.startsWith("weak")) {
      filters.push((p) => getEffectiveness(t, p.type_1, p.type_2) > 1);
    } else {
      filters.push((p) => getEffectiveness(t, p.type_1, p.type_2) < 1);
    }
  }

  // Type filter — skip types already consumed by the resistance filter.
  // Only count a type word if it's followed by a recognized qualifier or end-of-string,
  // so move names like "Ice Spinner" don't accidentally match the Ice type.
  const AFTER_TYPE_OK = /^\s*(?:type|types|pokemon|with|that|and|or|which|over|under|above|below|more|than|less|at|least|most|greater|fewer|$)/i;
  const matchedTypes = POKEMON_TYPES.filter((t) => {
    if (resistClaimedTypes.has(t)) return false;
    const re = new RegExp(`\\b${t}\\b`, "gi");
    let m;
    while ((m = re.exec(qForTypes)) !== null) {
      const after = qForTypes.slice(m.index + m[0].length);
      if (AFTER_TYPE_OK.test(after)) return true;
    }
    return false;
  });
  if (matchedTypes.length > 0) {
    filters.push((p) =>
      matchedTypes.some(
        (t) => p.type_1.toLowerCase() === t || p.type_2?.toLowerCase() === t
      )
    );
  }

  // Stat filters
  const statPatterns: [RegExp, "gt" | "lt" | "gte" | "lte"][] = [
    [/(?:over|more than|above|greater than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "gt"],
    [/(?:under|less than|below|fewer than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "lt"],
    [/(?:at least|minimum(?:\s+of)?)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "gte"],
    [/(?:at most|maximum(?:\s+of)?|no more than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "lte"],
  ];
  for (const [regex, op] of statPatterns) {
    let match;
    while ((match = regex.exec(q)) !== null) {
      const value = parseInt(match[1]);
      const stat = findStat(match[2].trim());
      if (!stat) continue;
      const s = stat, v = value;
      filters.push((p) => {
        const val = p[s] as number;
        if (op === "gt") return val > v;
        if (op === "lt") return val < v;
        if (op === "gte") return val >= v;
        return val <= v;
      });
    }
  }

  // Symbol forms: "speed > 100", "hp >= 50", "attack < 80", "def <= 90"
  // Order is (stat op number) so capture groups are reversed vs. word patterns
  const symbolPatterns: [RegExp, "gt" | "lt" | "gte" | "lte"][] = [
    [/([\w\s.]+?)\s*>=\s*(\d+)(?=\s|$)/gi, "gte"],
    [/([\w\s.]+?)\s*<=\s*(\d+)(?=\s|$)/gi, "lte"],
    [/([\w\s.]+?)\s*>\s*(\d+)(?=\s|$)/gi, "gt"],
    [/([\w\s.]+?)\s*<\s*(\d+)(?=\s|$)/gi, "lt"],
  ];
  for (const [regex, op] of symbolPatterns) {
    let match;
    while ((match = regex.exec(q)) !== null) {
      const stat = findStat(match[1].trim());
      const value = parseInt(match[2]);
      if (!stat) continue;
      const s = stat, v = value;
      filters.push((p) => {
        const val = p[s] as number;
        if (op === "gt") return val > v;
        if (op === "lt") return val < v;
        if (op === "gte") return val >= v;
        return val <= v;
      });
    }
  }

  // Move filter: "with the move X", "learns X", etc. — or bare move name in query
  const movePattern =
    /(?:with the move|with move|can learn|learns?|knows?)\s+([a-z][a-z\s'-]+?)(?=\s+(?:and|that|which|or|,)|\s*$)/gi;
  let moveMatch;
  while ((moveMatch = movePattern.exec(q)) !== null) {
    const moveName = moveMatch[1].trim();
    filters.push((p) =>
      p.moves.some(
        (m) =>
          m.name.toLowerCase().includes(moveName) ||
          moveName.includes(m.name.toLowerCase())
      )
    );
  }

  // Also detect known move names directly in the query (no keyword required)
  // matchedMoves was already computed above before the type filter
  if (matchedMoves.length > 0) {
    filters.push((p) =>
      matchedMoves.some((m) => p.moves.some((pm) => pm.name.toLowerCase() === m))
    );
  }

  // Ability filter: detect known ability names in query
  const allAbilities = new Set<string>();
  allPokemon.forEach((p) => {
    if (p.ability_1) allAbilities.add(p.ability_1.toLowerCase());
    if (p.ability_2) allAbilities.add(p.ability_2.toLowerCase());
    if (p.hidden_ability) allAbilities.add(p.hidden_ability.toLowerCase());
  });
  const matchedAbilities = [...allAbilities]
    .sort((a, b) => b.length - a.length)
    .filter((a) =>
      new RegExp(
        `\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      ).test(q)
    );
  if (matchedAbilities.length > 0) {
    filters.push((p) => {
      const pAbilities = [p.ability_1, p.ability_2, p.hidden_ability]
        .filter(Boolean)
        .map((a) => a!.toLowerCase());
      return matchedAbilities.some((a) => pAbilities.includes(a));
    });
  }

  // Name search fallback
  if (filters.length === 0) {
    const term = q.trim();
    filters.push((p) => p.name.toLowerCase().includes(term));
  }

  return (p) => filters.every((f) => f(p));
}

function buildFilter(
  query: string,
  allPokemon: PokemonWithMoves[]
): (p: PokemonWithMoves) => boolean {
  if (!query.trim()) return () => true;

  // OR splits into independent branches (any branch can match)
  const orBranches = query.split(/\bOR\b/i).map((s) => s.trim()).filter(Boolean);

  const branchFilters = orBranches.map((branch) => {
    // AND within a branch: all clauses must match
    const andClauses = branch.split(/\bAND\b/i).map((s) => s.trim()).filter(Boolean);
    const clauseFilters = andClauses.map((c) => buildClauseFilter(c, allPokemon));
    return (p: PokemonWithMoves) => clauseFilters.every((f) => f(p));
  });

  return (p) => branchFilters.some((f) => f(p));
}

interface TeamDraftInfo {
  id: number;
  name: string;
  conferenceId: number;
  draftPosition: number | null;
  pokemonIds: number[];
  draftEnded: boolean;
}

interface Props {
  conferences: Conference[];
  pokemon: PokemonWithMoves[];
  activeSeasonId: number | null;
  draftedByConference: { conferenceId: number; pokemonIds: number[] }[];
  userConferenceId: number | null;
  userTeamId: number | null;
  teams: TeamDraftInfo[];
  draftLog: { id: number; conferenceId: number; teamId: number }[];
  draftActiveByConference: { conferenceId: number; isActive: boolean; startedAt: string | null }[];
  pointBudget: number;
  faTokens: number;
  faTokensUsedByTeam: Record<number, number>;
  droppedByUserTeam: number[];
}


export default function DraftBoard({
  conferences,
  pokemon,
  activeSeasonId,
  draftedByConference: initialDrafted,
  userConferenceId,
  userTeamId,
  teams,
  draftLog,
  draftActiveByConference,
  pointBudget,
  faTokens,
  faTokensUsedByTeam: initialFaTokensUsedByTeam,
  droppedByUserTeam,
}: Props) {
  const router = useRouter();
  const defaultConferenceId = userConferenceId ?? conferences[0]?.id ?? null;
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(defaultConferenceId);
  const [view, setView] = useState<"pool" | "teams">("pool");

  // DraftTurnAlert's "Go to Draft" link points at this same page, so a plain
  // navigation is a no-op if we're already here — this event is how it forces
  // us back to the Pool tab even when we're currently viewing Teams.
  useEffect(() => {
    function handleGoToDraftPool() {
      setView("pool");
    }
    window.addEventListener(GO_TO_DRAFT_POOL_EVENT, handleGoToDraftPool);
    return () => window.removeEventListener(GO_TO_DRAFT_POOL_EVENT, handleGoToDraftPool);
  }, []);
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draftedMap, setDraftedMap] = useState<Record<number, Set<number>>>(
    () => {
      const map: Record<number, Set<number>> = {};
      for (const { conferenceId, pokemonIds } of initialDrafted) {
        map[conferenceId] = new Set(pokemonIds);
      }
      return map;
    }
  );

  const [teamRosterMap, setTeamRosterMap] = useState<Record<number, Set<number>>>(
    () => {
      const map: Record<number, Set<number>> = {};
      for (const team of teams) {
        map[team.id] = new Set(team.pokemonIds);
      }
      return map;
    }
  );

  // How many picks have been logged so far, per conference — drives turn tracking
  const [pickCountMap, setPickCountMap] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const { conferenceId } of draftLog) {
      map[conferenceId] = (map[conferenceId] ?? 0) + 1;
    }
    return map;
  });

  // How many picks each team has actually made (from draft_log, not roster
  // size — a team's roster can include historically-seeded pokemon that
  // predate live drafting, so roster size is not a reliable proxy here).
  // Drives which future rounds get skipped once a team ends their draft.
  const [teamPickCountMap, setTeamPickCountMap] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const { teamId } of draftLog) {
      map[teamId] = (map[teamId] ?? 0) + 1;
    }
    return map;
  });

  // draft_log DELETE payloads only carry the row id (not conference_id or
  // team_id), so this tracks id -> {conferenceId, teamId} locally to know
  // what to decrement.
  const pickIdToInfoRef = useRef<Map<number, { conferenceId: number; teamId: number }>>(
    new Map(draftLog.map((d) => [d.id, { conferenceId: d.conferenceId, teamId: d.teamId }]))
  );

  const [draftActiveMap, setDraftActiveMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const { conferenceId, isActive } of draftActiveByConference) {
      map[conferenceId] = isActive;
    }
    return map;
  });

  // Set once a conference's draft has ever been started — distinguishes
  // "not started yet" (locked) from "ended" (free agency open).
  const [draftStartedMap, setDraftStartedMap] = useState<Record<number, string | null>>(() => {
    const map: Record<number, string | null> = {};
    for (const { conferenceId, startedAt } of draftActiveByConference) {
      map[conferenceId] = startedAt;
    }
    return map;
  });

  const [faTokensUsedByTeam, setFaTokensUsedByTeam] = useState(initialFaTokensUsedByTeam);

  // Whether each team has ended their draft — drives turn-order skipping
  // and the "DRAFT ENDED" badge on their card.
  const [draftEndedMap, setDraftEndedMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const team of teams) {
      map[team.id] = team.draftEnded;
    }
    return map;
  });

  // Modal state for the pool-tab click-to-draft/add flow
  const [pickingPokemon, setPickingPokemon] = useState<PokemonWithMoves | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawQuery]);

  useEffect(() => {
    if (!activeSeasonId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("rosters-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rosters" },
        (payload) => {
          const row = payload.new as {
            pokemon_id: number;
            conference_id: number;
            season_id: number;
            team_id: number;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftedMap((prev) => {
            const next = new Set(prev[row.conference_id]);
            next.add(row.pokemon_id);
            return { ...prev, [row.conference_id]: next };
          });
          setTeamRosterMap((prev) => {
            const next = new Set(prev[row.team_id]);
            next.add(row.pokemon_id);
            return { ...prev, [row.team_id]: next };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rosters" },
        (payload) => {
          // Note: only primary-key columns (pokemon_id, conference_id, season_id)
          // are guaranteed present on DELETE — team_id is not part of the PK, so
          // we look up which team currently owns the pokemon instead.
          const row = payload.old as {
            pokemon_id: number;
            conference_id: number;
            season_id: number;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftedMap((prev) => {
            if (!prev[row.conference_id]) return prev;
            const next = new Set(prev[row.conference_id]);
            next.delete(row.pokemon_id);
            return { ...prev, [row.conference_id]: next };
          });
          setTeamRosterMap((prev) => {
            const owningTeam = teams.find(
              (t) =>
                t.conferenceId === row.conference_id &&
                prev[t.id]?.has(row.pokemon_id)
            );
            if (!owningTeam) return prev;
            const next = new Set(prev[owningTeam.id]);
            next.delete(row.pokemon_id);
            return { ...prev, [owningTeam.id]: next };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_log" },
        (payload) => {
          const row = payload.new as {
            id: number;
            season_id: number;
            conference_id: number;
            team_id: number;
          };
          if (row.season_id !== activeSeasonId) return;
          pickIdToInfoRef.current.set(row.id, { conferenceId: row.conference_id, teamId: row.team_id });
          setPickCountMap((prev) => ({
            ...prev,
            [row.conference_id]: (prev[row.conference_id] ?? 0) + 1,
          }));
          setTeamPickCountMap((prev) => ({
            ...prev,
            [row.team_id]: (prev[row.team_id] ?? 0) + 1,
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "draft_log" },
        (payload) => {
          // DELETE payloads only guarantee the primary key (id), so the
          // conference/team are looked up from what INSERT events already told us.
          const row = payload.old as { id: number };
          const info = pickIdToInfoRef.current.get(row.id);
          if (info === undefined) return;
          pickIdToInfoRef.current.delete(row.id);
          setPickCountMap((prev) => ({
            ...prev,
            [info.conferenceId]: Math.max(0, (prev[info.conferenceId] ?? 0) - 1),
          }));
          setTeamPickCountMap((prev) => ({
            ...prev,
            [info.teamId]: Math.max(0, (prev[info.teamId] ?? 0) - 1),
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conference_drafts" },
        (payload) => {
          const row = payload.new as {
            season_id: number;
            conference_id: number;
            is_active: boolean;
            started_at: string | null;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftActiveMap((prev) => ({ ...prev, [row.conference_id]: row.is_active }));
          setDraftStartedMap((prev) => ({ ...prev, [row.conference_id]: row.started_at }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conference_drafts" },
        (payload) => {
          const row = payload.new as {
            season_id: number;
            conference_id: number;
            is_active: boolean;
            started_at: string | null;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftActiveMap((prev) => ({ ...prev, [row.conference_id]: row.is_active }));
          setDraftStartedMap((prev) => ({ ...prev, [row.conference_id]: row.started_at }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_seasons" },
        (payload) => {
          const row = payload.new as { team_id: number; season_id: number; draft_ended_at: string | null };
          if (row.season_id !== activeSeasonId) return;
          setDraftEndedMap((prev) => ({ ...prev, [row.team_id]: row.draft_ended_at !== null }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSeasonId, teams]);

  const draftedIds = useMemo(
    () =>
      selectedConferenceId !== null
        ? (draftedMap[selectedConferenceId] ?? new Set<number>())
        : new Set<number>(),
    [selectedConferenceId, draftedMap]
  );

  const filterFn = useMemo(
    () => buildFilter(debouncedQuery, pokemon),
    [debouncedQuery, pokemon]
  );
  const filteredPokemon = useMemo(
    () => pokemon.filter(filterFn),
    [pokemon, filterFn]
  );

  const groups = useMemo(() => {
    const map = new Map<number, PokemonWithMoves[]>();
    for (const p of filteredPokemon) {
      if (!map.has(p.point_value)) map.set(p.point_value, []);
      map.get(p.point_value)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filteredPokemon]);

  const noResults = !!debouncedQuery.trim() && filteredPokemon.length === 0;

  const pokemonById = useMemo(
    () => new Map(pokemon.map((p) => [p.id, p])),
    [pokemon]
  );

  const undraftedForPicker = useMemo(
    () => pokemon.filter((p) => !draftedIds.has(p.id)),
    [pokemon, draftedIds]
  );

  const teamsForConference = useMemo(
    () =>
      teams
        .filter((t) => t.conferenceId === selectedConferenceId)
        .sort((a, b) => (a.draftPosition ?? 999) - (b.draftPosition ?? 999)),
    [teams, selectedConferenceId]
  );

  const isDraftActive = selectedConferenceId !== null && !!draftActiveMap[selectedConferenceId];

  const nextPickNumber = (selectedConferenceId !== null ? pickCountMap[selectedConferenceId] ?? 0 : 0) + 1;

  const onClockTeamId = useMemo(() => {
    if (!isDraftActive) return null;
    const teamStates = teamsForConference.map((t) => ({
      id: t.id,
      draftPosition: t.draftPosition,
      draftEnded: draftEndedMap[t.id] ?? false,
      picksMade: teamPickCountMap[t.id] ?? 0,
    }));
    return computeOnClockTeamId(teamStates);
  }, [isDraftActive, teamsForConference, draftEndedMap, teamPickCountMap]);

  // Click-to-draft is only interactive while viewing your own conference —
  // every other case (other conference, logged out) stays view-only.
  const isViewingOwnConference =
    userTeamId !== null && selectedConferenceId !== null && selectedConferenceId === userConferenceId;
  const myDraftEnded = userTeamId !== null && !!draftEndedMap[userTeamId];
  const selectedDraftStarted = selectedConferenceId !== null ? draftStartedMap[selectedConferenceId] : null;
  const clickMode: "draft" | "add" | null = !isViewingOwnConference
    ? null
    : isDraftActive && !myDraftEnded
      ? "draft"
      : selectedDraftStarted
        ? "add"
        : null;

  const myTeamPokemonIds = userTeamId !== null ? teamRosterMap[userTeamId] ?? new Set<number>() : new Set<number>();
  const myTeamSpent = [...myTeamPokemonIds].reduce(
    (sum, id) => sum + (pokemonById.get(id)?.point_value ?? 0),
    0
  );
  const myFaTokensUsed = userTeamId !== null ? faTokensUsedByTeam[userTeamId] ?? 0 : 0;

  const myTeamRosterSize = myTeamPokemonIds.size;

  const droppedByUserTeamSet = useMemo(() => new Set(droppedByUserTeam), [droppedByUserTeam]);

  const pickingDisabledReason = useMemo(() => {
    if (!pickingPokemon || clickMode === null) return null;
    if (clickMode === "draft" && onClockTeamId !== userTeamId) return "It's not your team's turn to pick.";
    if (clickMode === "add" && droppedByUserTeamSet.has(pickingPokemon.id)) {
      return "Your team already dropped this pokemon and can't re-add it.";
    }
    if (myTeamRosterSize >= DRAFT_SLOT_COUNT) return "Your roster is full.";
    if (myTeamSpent + pickingPokemon.point_value > pointBudget) return "Not enough points remaining.";
    if (clickMode === "add" && myFaTokensUsed >= faTokens) return "No free agency tokens remaining.";
    return null;
  }, [
    pickingPokemon,
    clickMode,
    onClockTeamId,
    userTeamId,
    droppedByUserTeamSet,
    myTeamRosterSize,
    myTeamSpent,
    pointBudget,
    myFaTokensUsed,
    faTokens,
  ]);

  async function handleConfirmPick() {
    if (!pickingPokemon || clickMode === null) return { error: "Nothing to submit" };
    const result =
      clickMode === "draft"
        ? await submitDraftPick(pickingPokemon.id)
        : await addFreeAgent(pickingPokemon.id);
    if (!result.error && userTeamId !== null && clickMode === "add") {
      setFaTokensUsedByTeam((prev) => ({ ...prev, [userTeamId]: (prev[userTeamId] ?? 0) + 1 }));
    }
    if (!result.error && clickMode === "draft") {
      // Jump to the Teams view so the live picks (including this one) are visible.
      setView("teams");
    }
    return result;
  }

  function handleClosePickModal() {
    setPickingPokemon(null);
    router.refresh();
  }

  return (
    <main className="pt-20 pb-16 min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        {/* Conference toggle */}
        <div className="my-6">
          <div className="bg-white/5 rounded-2xl p-1.5 flex w-full border border-white/10">
            {conferences.map((conf) => {
              const isSelected = selectedConferenceId === conf.id;
              const theme = getConferenceTheme(conf.name);
              return (
                <button
                  key={conf.id}
                  onClick={() => setSelectedConferenceId(conf.id)}
                  className={`flex-1 py-4 rounded-xl font-bold text-xl tracking-wide transition-[color,box-shadow] duration-200 ${
                    isSelected
                      ? "text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                  style={
                    isSelected
                      ? {
                          background: theme.gradient,
                          boxShadow: theme.shadow,
                          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                        }
                      : undefined
                  }
                >
                  {conf.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* View toggle + search (search only shown in Pool view). Only pinned
            while on the Pool tab — the Teams tab's grid already fits without
            scrolling past it, so pinning there just wastes vertical space. */}
        <div
          className={`z-20 pb-4 pt-2 -mx-6 px-6 bg-[#0a0a1a]/90 backdrop-blur-sm flex items-center gap-3 ${
            view === "pool" ? "sticky top-20" : ""
          }`}
        >
          <div className="bg-white/5 rounded-2xl p-1.5 flex border border-white/10 shrink-0">
            {(
              [
                ["pool", "Pool"],
                ["teams", "Teams"],
              ] as [typeof view, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-3 rounded-xl font-bold text-sm tracking-wide transition-colors duration-200 ${
                  view === v
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "pool" && (
            <input
              type="text"
              placeholder='Search... e.g. "Water type over 100 attack OR over 100 spa", "Fire type AND speed > 100"'
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            />
          )}
        </div>

        {view === "pool" ? (
          <>
            {/* No results */}
            {noResults && (
              <div className="text-center py-20 text-gray-500 text-sm">
                No pokemon match your search.
              </div>
            )}

            {/* Board rows grouped by point value */}
            {groups.map(([pointValue, group]) => (
              <div key={pointValue} className="mb-10">
                <div className="flex items-center gap-4 mb-5">
                  <div className="h-px flex-1 bg-white/10" />
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white tabular-nums">
                      {pointValue}
                    </span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                      pts
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="flex flex-wrap gap-3">
                  {group.map((p) => (
                    <PokemonCard
                      key={p.id}
                      pokemon={p}
                      isDrafted={draftedIds.has(p.id)}
                      clickable={clickMode !== null}
                      onClick={clickMode !== null ? () => setPickingPokemon(p) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          // Break out of the max-w-7xl wrapper so team panels get the full viewport width
          <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] px-6">
            <div className="max-w-[1700px] mx-auto">
              <TeamsView
                teams={teamsForConference}
                teamRosterMap={teamRosterMap}
                pokemonById={pokemonById}
                isDraftActive={isDraftActive}
                onClockTeamId={onClockTeamId}
                draftEndedMap={draftEndedMap}
                nextPickNumber={nextPickNumber}
                teamCount={teamsForConference.length}
                pointBudget={pointBudget}
                userTeamId={userTeamId}
                canPick={clickMode !== null}
                onOpenPicker={() => setPickerOpen(true)}
              />
            </div>
          </div>
        )}
      </div>

      {pickerOpen && clickMode !== null && (
        <PokemonPickerModal
          pokemon={undraftedForPicker}
          onPick={(p) => {
            const full = pokemonById.get(p.id);
            if (full) setPickingPokemon(full);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {pickingPokemon && clickMode !== null && (
        <DraftPickModal
          pokemon={pickingPokemon}
          mode={clickMode}
          currentSpent={myTeamSpent}
          pointBudget={pointBudget}
          faTokensRemaining={clickMode === "add" ? faTokens - myFaTokensUsed : null}
          disabledReason={pickingDisabledReason}
          onConfirm={handleConfirmPick}
          onClose={handleClosePickModal}
        />
      )}
    </main>
  );
}

function PokemonPickerModal({
  pokemon,
  onPick,
  onClose,
}: {
  pokemon: SearchablePokemon[];
  onPick: (pokemon: SearchablePokemon) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Choose a pokemon</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm font-bold px-1"
          >
            ✕
          </button>
        </div>
        <PokemonSearchList pokemon={pokemon} onPick={onPick} maxHeightClassName="max-h-96" />
      </div>
    </div>
  );
}

function TeamsView({
  teams,
  teamRosterMap,
  pokemonById,
  isDraftActive,
  onClockTeamId,
  draftEndedMap,
  nextPickNumber,
  teamCount,
  pointBudget,
  userTeamId,
  canPick,
  onOpenPicker,
}: {
  teams: TeamDraftInfo[];
  teamRosterMap: Record<number, Set<number>>;
  pokemonById: Map<number, PokemonWithMoves>;
  isDraftActive: boolean;
  onClockTeamId: number | null;
  draftEndedMap: Record<number, boolean>;
  nextPickNumber: number;
  teamCount: number;
  pointBudget: number;
  userTeamId: number | null;
  canPick: boolean;
  onOpenPicker: () => void;
}) {
  if (teams.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500 text-sm">
        No teams found for this conference.
      </div>
    );
  }

  const totalSlots = teamCount * DRAFT_SLOT_COUNT;
  // onClockTeamId is null exactly when compute_on_clock_team's skip-aware
  // walk has exhausted every team's remaining rounds — the authoritative
  // "nothing left to pick" signal, unlike a naive picks-vs-totalSlots count
  // which doesn't know about teams who ended early.
  const draftComplete = isDraftActive && onClockTeamId === null;
  const round = teamCount > 0 ? Math.ceil(Math.min(nextPickNumber, totalSlots) / teamCount) : 0;

  return (
    <div className="pb-4">
      {isDraftActive && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-400 font-bold tracking-wide">
            {draftComplete
              ? "DRAFT COMPLETE"
              : `DRAFT LIVE — Round ${round}, Pick ${nextPickNumber}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {teams.map((team) => {
          const pokemonIds = [...(teamRosterMap[team.id] ?? [])];
          const pokemonList = pokemonIds
            .map((id) => pokemonById.get(id))
            .filter((p): p is PokemonWithMoves => !!p);
          const spent = pokemonList.reduce((sum, p) => sum + p.point_value, 0);
          const remaining = pointBudget - spent;
          const onClock = team.id === onClockTeamId;
          const ended = isDraftActive && !!draftEndedMap[team.id];
          const isMyTeam = team.id === userTeamId;
          const canPickIntoThisTeam = isMyTeam && canPick && pokemonList.length < DRAFT_SLOT_COUNT;

          return (
            <div
              key={team.id}
              className={`bg-white/5 border rounded-2xl p-4 flex flex-col min-w-0 transition-colors ${
                onClock
                  ? "border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20"
                  : canPickIntoThisTeam
                    ? "border-indigo-400/40"
                    : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shrink-0 ${
                    onClock ? "bg-emerald-500" : "bg-indigo-600"
                  }`}
                >
                  {team.draftPosition ?? "—"}
                </span>
                <span className="text-white text-base font-bold truncate min-w-0">
                  {team.name}
                </span>
                {onClock && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-400 tracking-wide shrink-0">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    ON THE CLOCK
                  </span>
                )}
                {ended && (
                  <span className="ml-auto text-[10px] font-bold text-gray-500 tracking-wide shrink-0">
                    DRAFT ENDED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: DRAFT_SLOT_COUNT }).map((_, i) => (
                  <DraftSlot
                    key={i}
                    slotNumber={i + 1}
                    pokemon={pokemonList[i]}
                    onClick={!pokemonList[i] && canPickIntoThisTeam ? onOpenPicker : undefined}
                  />
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  Spent <span className="text-gray-300 font-semibold">{spent}</span>
                </span>
                <span
                  className={`font-bold ${
                    remaining < 0 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {remaining} left
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraftSlot({
  slotNumber,
  pokemon,
  onClick,
}: {
  slotNumber: number;
  pokemon: PokemonWithMoves | undefined;
  onClick?: () => void;
}) {
  if (!pokemon) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          className={`w-full aspect-square rounded-lg border border-dashed flex items-center justify-center text-[10px] transition-colors ${
            onClick
              ? "border-indigo-400/60 text-indigo-400 hover:border-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
              : "border-white/10 text-gray-700 cursor-default"
          }`}
        >
          {onClick ? "+" : slotNumber}
        </button>
        <span className="text-[9px] leading-tight">&nbsp;</span>
      </div>
    );
  }

  const primaryColor = TYPE_COLORS[pokemon.type_1] ?? "#6b7280";

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
      <div
        className="group relative w-full aspect-square rounded-lg overflow-hidden bg-white/5 border-t-2 border border-white/10"
        style={{ borderTopColor: primaryColor }}
      >
        {pokemon.dex_number ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.dex_number}.png`}
            alt={pokemon.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.dex_number}.png`;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
            ?
          </div>
        )}

        {/* Point value badge */}
        <span className="absolute bottom-0.5 right-0.5 bg-black/75 text-white text-[9px] font-bold leading-none px-1 py-0.5 rounded">
          {pokemon.point_value}
        </span>

        {/* Hover tooltip */}
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-[#12122a] border border-white/15 rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none z-30 transition-opacity shadow-2xl whitespace-nowrap">
          <p className="font-semibold text-white text-xs">{pokemon.name}</p>
        </div>
      </div>
      <span className="text-[9px] text-gray-400 text-center w-full truncate leading-tight">
        {pokemon.name}
      </span>
    </div>
  );
}

function PokemonCard({
  pokemon,
  isDrafted,
  clickable,
  onClick,
}: {
  pokemon: PokemonWithMoves;
  isDrafted: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) {
  const types = [pokemon.type_1, pokemon.type_2].filter(Boolean) as string[];
  const primaryColor = TYPE_COLORS[pokemon.type_1] ?? "#6b7280";
  const isInteractive = clickable && !isDrafted;

  return (
    <div className="group relative flex flex-col items-center">
      {/* Card */}
      <div
        onClick={isInteractive ? onClick : undefined}
        className={`relative w-[72px] rounded-lg overflow-hidden border-t-2 border border-white/10 transition-all duration-200 ${
          isDrafted
            ? "opacity-25 grayscale"
            : isInteractive
              ? "hover:scale-110 hover:z-10 hover:ring-2 hover:ring-indigo-400 cursor-pointer"
              : "hover:scale-110 hover:z-10 hover:border-white/20 cursor-pointer"
        }`}
        style={{ borderTopColor: isDrafted ? "transparent" : primaryColor }}
      >
        {pokemon.dex_number ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.dex_number}.png`}
            alt={pokemon.name}
            width={72}
            height={72}
            className="w-full h-auto"
            onError={(e) => {
              e.currentTarget.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.dex_number}.png`;
            }}
          />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center text-gray-600 text-2xl bg-white/5">
            ?
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`mt-1 text-[10px] text-center w-[72px] truncate leading-tight ${
          isDrafted ? "text-gray-600" : "text-gray-300"
        }`}
      >
        {pokemon.name}
      </span>

      {/* Hover tooltip */}
      {!isDrafted && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#12122a] border border-white/15 rounded-xl px-3 py-2.5 opacity-0 group-hover:opacity-100 pointer-events-none z-30 transition-opacity shadow-2xl min-w-[160px]">
          <p className="font-semibold text-white text-sm">{pokemon.name}</p>

          {/* Types */}
          <div className="flex gap-1 mt-1">
            {types.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: (TYPE_COLORS[t] ?? "#6b7280") + "33",
                  color: TYPE_COLORS[t] ?? "#9ca3af",
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Abilities */}
          <p className="text-gray-500 text-[10px] mt-1.5">
            {[pokemon.ability_1, pokemon.ability_2, pokemon.hidden_ability]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {/* Stats */}
          <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
            {(
              [
                ["HP", pokemon.hp],
                ["Atk", pokemon.atk],
                ["Def", pokemon.def],
                ["SpA", pokemon.spa],
                ["SpD", pokemon.spd],
                ["Spe", pokemon.spe],
              ] as [string, number][]
            ).map(([label, val]) => (
              <span key={label}>
                {label}{" "}
                <span className="text-gray-300 font-medium">{val}</span>
              </span>
            ))}
          </div>

          {/* Notable moves */}
          {pokemon.moves.length > 0 && (
            <p className="text-indigo-400 text-[10px] mt-1.5 leading-tight">
              {pokemon.moves.map((m) => m.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
