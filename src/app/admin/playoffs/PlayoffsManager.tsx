"use client";

import { useActionState, useState } from "react";
import { createBracket, setBracketSlotTeam, clearBracket } from "./actions";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";

type Season = { id: number; name: string; is_active: boolean };
type Team = { id: number; team_name: string };
type Slot = { id: number; season_id: number; round: number; position: number; team_id: number | null };

type Props = {
  seasons: Season[];
  teams: Team[];
  slots: Slot[];
};

const SIZES = [2, 4, 8, 12, 16] as const;

// Labels per bracket shape, keyed by "<round-1 slot count>-<total rounds>" —
// the only two numbers needed to disambiguate every size we support,
// including the 12-team bracket sharing round 1's slot count (8) with the
// 8-team bracket but needing one more round for its bye structure.
const ROUND_LABELS: Record<string, string[]> = {
  "2-1": ["Final"],
  "4-2": ["Semifinals", "Final"],
  "8-3": ["Quarterfinals", "Semifinals", "Final"],
  "8-4": ["First Round", "Quarterfinals", "Semifinals", "Final"],
  "16-4": ["Round of 16", "Quarterfinals", "Semifinals", "Final"],
};

function roundLabel(firstRoundSlotCount: number, totalRounds: number, roundIdx: number): string {
  const key = `${firstRoundSlotCount}-${totalRounds}`;
  return ROUND_LABELS[key]?.[roundIdx] ?? `Round ${roundIdx + 1}`;
}

function BracketSlotSelect({ slot, teams }: { slot: Slot; teams: Team[] }) {
  const [state, action, pending] = useActionState(setBracketSlotTeam, null);
  // Controlled, not defaultValue: a <form action={...}> auto-resets any
  // uncontrolled field to its original mount-time value once the action
  // succeeds, which was snapping this select back to "TBD" right after a
  // real pick landed. Keyed on slot.team_id in the parent list so this
  // still resyncs to the authoritative server value after each save.
  const [value, setValue] = useState(slot.team_id?.toString() ?? "");

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="season_id" value={slot.season_id} />
      <input type="hidden" name="round" value={slot.round} />
      <input type="hidden" name="position" value={slot.position} />
      <select
        name="team_id"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          e.currentTarget.form?.requestSubmit();
        }}
        disabled={pending}
        className={`${selectCls} w-full`}
      >
        <option value="">— TBD —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.team_name}</option>
        ))}
      </select>
      {state?.error && <p className="text-red-400 text-xs shrink-0">{state.error}</p>}
    </form>
  );
}

function CreateBracketForm({ seasonId }: { seasonId: number }) {
  const [state, action, pending] = useActionState(createBracket, null);

  return (
    <form action={action} className="flex flex-col gap-3 items-start">
      <input type="hidden" name="season_id" value={seasonId} />
      <p className="text-sm text-gray-400">No bracket set up yet for this season.</p>
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Bracket size</label>
          <select name="size" defaultValue={8} className={`${selectCls} w-56`}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} teams{s === 12 ? " (top 4 seeds bye)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Bracket"}
        </button>
      </div>
      {state?.error && <p className="text-red-400 text-xs">{state.error}</p>}
    </form>
  );
}

function ClearBracketButton({ seasonId }: { seasonId: number }) {
  const [state, action, pending] = useActionState(clearBracket, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded-lg transition-colors"
      >
        Clear Bracket
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="season_id" value={seasonId} />
      <span className="text-xs text-gray-400">Delete this whole bracket?</span>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
      >
        {pending ? "Clearing…" : "Yes, clear"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
      >
        Cancel
      </button>
      {state?.error && <p className="text-red-400 text-xs">{state.error}</p>}
    </form>
  );
}

export default function PlayoffsManager({ seasons, teams, slots }: Props) {
  const activeSeason = seasons.find((s) => s.is_active) ?? seasons[0] ?? null;
  const [seasonId, setSeasonId] = useState<number | null>(activeSeason?.id ?? null);

  if (!seasonId) {
    return <p className="text-gray-500 text-sm">Set up a season first.</p>;
  }

  const bracketSlots = slots.filter((s) => s.season_id === seasonId);

  const roundsMap = new Map<number, Slot[]>();
  for (const s of bracketSlots) {
    const list = roundsMap.get(s.round) ?? [];
    list.push(s);
    roundsMap.set(s.round, list);
  }
  const rounds = [...roundsMap.keys()].sort((a, b) => a - b);
  const totalRounds = rounds.length;
  const firstRoundSlotCount = (roundsMap.get(rounds[0]) ?? []).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Season</label>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(Number(e.target.value))}
            className={`${selectCls} w-56`}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.is_active ? " (active)" : ""}
              </option>
            ))}
          </select>
        </div>
        {bracketSlots.length > 0 && <ClearBracketButton seasonId={seasonId} />}
      </div>

      {bracketSlots.length === 0 ? (
        <CreateBracketForm seasonId={seasonId} />
      ) : (
        <div className="flex gap-8 overflow-x-auto pb-4">
          {rounds.map((round, idx) => {
            const roundSlots = (roundsMap.get(round) ?? []).sort((a, b) => a.position - b.position);
            return (
              <div key={round} className="flex flex-col gap-4 shrink-0 w-56">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {roundLabel(firstRoundSlotCount, totalRounds, idx)}
                </h3>
                {roundSlots.map((slot) => (
                  <div
                    key={`${slot.id}-${slot.team_id ?? "tbd"}`}
                    className="border border-white/10 rounded-lg p-2"
                  >
                    <BracketSlotSelect slot={slot} teams={teams} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
