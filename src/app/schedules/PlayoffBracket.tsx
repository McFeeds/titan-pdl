import type { BracketSlot } from "./types";

// Labels per bracket shape, keyed by "<round-1 slot count>-<total rounds>" —
// the only two numbers needed to disambiguate every size the admin editor
// supports, including the 12-team bracket sharing round 1's slot count (8)
// with the 8-team bracket but needing one more round for its bye structure.
// Mirrors the same table in the admin bracket editor.
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

function SlotLogo({ team }: { team: BracketSlot["team"] }) {
  if (!team) {
    return (
      <div className="w-8 h-8 rounded-md bg-white/5 shrink-0 flex items-center justify-center text-[10px] text-gray-600 font-bold">
        ?
      </div>
    );
  }
  return team.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={team.logo_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-md bg-indigo-600/40 shrink-0 flex items-center justify-center text-xs font-bold text-indigo-300">
      {team.team_name[0]?.toUpperCase()}
    </div>
  );
}

function SlotCard({ team }: { team: BracketSlot["team"] }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 min-w-[180px] ${
        team ? "bg-white/[0.06] border border-white/10" : "bg-white/[0.02] border border-white/5"
      }`}
    >
      <SlotLogo team={team} />
      <span className={`text-xs font-semibold truncate ${team ? "text-gray-200" : "text-gray-600 italic"}`}>
        {team?.team_name ?? "TBD"}
      </span>
    </div>
  );
}

// Each matchup pair gets a right-side bracket connector (⊐ shape) linking
// its two slots toward the next round, using justify-around spacing per
// round column (see PlayoffBracket below) to keep later rounds roughly
// centered between their source matchups without needing exact pixel math.
function MatchupPair({ slots, isFinal }: { slots: BracketSlot[]; isFinal: boolean }) {
  return (
    <div className={`relative flex flex-col gap-4 ${isFinal ? "" : "pr-4"}`}>
      {slots.map((slot) => (
        <SlotCard key={slot.position} team={slot.team} />
      ))}
      {!isFinal && (
        <div className="absolute right-0 top-1/4 bottom-1/4 w-4 border-t border-r border-b border-white/15 rounded-r pointer-events-none" />
      )}
    </div>
  );
}

export default function PlayoffBracket({ slots }: { slots: BracketSlot[] }) {
  if (slots.length === 0) return null;

  const roundsMap = new Map<number, BracketSlot[]>();
  for (const s of slots) {
    const list = roundsMap.get(s.round) ?? [];
    list.push(s);
    roundsMap.set(s.round, list);
  }
  const rounds = [...roundsMap.keys()].sort((a, b) => a - b);
  const totalRounds = rounds.length;
  const firstRoundSlotCount = (roundsMap.get(rounds[0]) ?? []).length;
  // Fixed height every round column shares, so justify-around naturally
  // centers sparser later rounds between their source matchups.
  const columnHeight = (firstRoundSlotCount / 2) * 104;

  return (
    <div className="bg-[#0d0d20] border border-white/10 rounded-2xl p-5 mb-8">
      <h2 className="text-sm font-bold text-white mb-4">Playoff Bracket</h2>
      <div className="flex gap-10 overflow-x-auto">
        {rounds.map((round, idx) => {
          const roundSlots = (roundsMap.get(round) ?? []).sort((a, b) => a.position - b.position);
          const matchups: BracketSlot[][] = [];
          for (let i = 0; i < roundSlots.length; i += 2) {
            matchups.push(roundSlots.slice(i, i + 2));
          }
          const isFinal = idx === totalRounds - 1;

          return (
            <div key={round} className="flex flex-col shrink-0">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                {roundLabel(firstRoundSlotCount, totalRounds, idx)}
              </h3>
              <div className="flex flex-col justify-around" style={{ height: columnHeight }}>
                {matchups.map((pair, i) => (
                  <MatchupPair key={i} slots={pair} isFinal={isFinal} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
