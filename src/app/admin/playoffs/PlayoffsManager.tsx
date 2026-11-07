"use client";

import { useActionState, useState } from "react";
import { createBracket, setBracketSlotTeam, clearBracket } from "./actions";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";

type Season = { id: number; name: string; is_active: boolean };
type Conference = { id: number; name: string };
type Team = { id: number; team_name: string };
type Slot = { id: number; season_id: number; conference_id: number; round: number; position: number; team_id: number | null };

type Props = {
  seasons: Season[];
  conferences: Conference[];
  teams: Team[];
  slots: Slot[];
};

const SIZES = [2, 4, 8, 16] as const;

// Human label for a round, counting back from the final (0 = final).
function roundLabel(roundsFromEnd: number): string {
  if (roundsFromEnd === 0) return "Final";
  if (roundsFromEnd === 1) return "Semifinals";
  if (roundsFromEnd === 2) return "Quarterfinals";
  return `Round ${roundsFromEnd + 1} of 16`;
}

function BracketSlotSelect({
  slot,
  teams,
}: {
  slot: Slot;
  teams: Team[];
}) {
  const [state, action, pending] = useActionState(setBracketSlotTeam, null);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="season_id" value={slot.season_id} />
      <input type="hidden" name="conference_id" value={slot.conference_id} />
      <input type="hidden" name="round" value={slot.round} />
      <input type="hidden" name="position" value={slot.position} />
      <select
        name="team_id"
        defaultValue={slot.team_id?.toString() ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
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

function CreateBracketForm({ seasonId, conferenceId }: { seasonId: number; conferenceId: number }) {
  const [state, action, pending] = useActionState(createBracket, null);

  return (
    <form action={action} className="flex flex-col gap-3 items-start">
      <input type="hidden" name="season_id" value={seasonId} />
      <input type="hidden" name="conference_id" value={conferenceId} />
      <p className="text-sm text-gray-400">No bracket set up yet for this season/conference.</p>
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Bracket size</label>
          <select name="size" defaultValue={8} className={`${selectCls} w-36`}>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s} teams</option>
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

function ClearBracketButton({ seasonId, conferenceId }: { seasonId: number; conferenceId: number }) {
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
      <input type="hidden" name="conference_id" value={conferenceId} />
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

export default function PlayoffsManager({ seasons, conferences, teams, slots }: Props) {
  const activeSeason = seasons.find((s) => s.is_active) ?? seasons[0] ?? null;
  const [seasonId, setSeasonId] = useState<number | null>(activeSeason?.id ?? null);
  const [conferenceId, setConferenceId] = useState<number | null>(conferences[0]?.id ?? null);

  if (!seasonId || !conferenceId) {
    return <p className="text-gray-500 text-sm">Set up a season and conference first.</p>;
  }

  const bracketSlots = slots.filter((s) => s.season_id === seasonId && s.conference_id === conferenceId);

  const roundsMap = new Map<number, Slot[]>();
  for (const s of bracketSlots) {
    const list = roundsMap.get(s.round) ?? [];
    list.push(s);
    roundsMap.set(s.round, list);
  }
  const rounds = [...roundsMap.keys()].sort((a, b) => a - b);
  const totalRounds = rounds.length;

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
        {bracketSlots.length > 0 && (
          <ClearBracketButton seasonId={seasonId} conferenceId={conferenceId} />
        )}
      </div>

      {conferences.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {conferences.map((c) => (
            <button
              key={c.id}
              onClick={() => setConferenceId(c.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                conferenceId === c.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {bracketSlots.length === 0 ? (
        <CreateBracketForm seasonId={seasonId} conferenceId={conferenceId} />
      ) : (
        <div className="flex gap-8 overflow-x-auto pb-4">
          {rounds.map((round, idx) => {
            const roundSlots = (roundsMap.get(round) ?? []).sort((a, b) => a.position - b.position);
            return (
              <div key={round} className="flex flex-col gap-4 shrink-0 w-56">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {roundLabel(totalRounds - 1 - idx)}
                </h3>
                {roundSlots.map((slot) => (
                  <div key={slot.id} className="border border-white/10 rounded-lg p-2">
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
