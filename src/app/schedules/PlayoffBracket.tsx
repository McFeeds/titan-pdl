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
      <div className="w-12 h-12 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-xs text-gray-600 font-bold">
        ?
      </div>
    );
  }
  return team.logo_url ? (
    // The team's own submitted logo — never a placeholder/sprite.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={team.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
  ) : (
    <div className="w-12 h-12 rounded-lg bg-indigo-600/40 shrink-0 flex items-center justify-center text-base font-bold text-indigo-300">
      {team.team_name[0]?.toUpperCase()}
    </div>
  );
}

function SlotCard({ team }: { team: BracketSlot["team"] }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 min-w-[240px] ${
        team ? "bg-white/[0.06] border border-white/10" : "bg-white/[0.02] border border-white/5"
      }`}
    >
      <SlotLogo team={team} />
      <span className={`text-sm font-semibold truncate ${team ? "text-gray-200" : "text-gray-600 italic"}`}>
        {team?.team_name ?? "TBD"}
      </span>
    </div>
  );
}

// Every matchup pair reserves pr-16 (64px) of space for its connector, so
// every column lines up the same whether or not this round reaches the
// next one. Within that space, a short local elbow (right-10 w-6, the last
// 24px) always joins THIS pair's own two slots into one point at their
// shared vertical center — that part needs no cross-matchup math.
function MatchupPair({ slots, hasNext }: { slots: BracketSlot[]; hasNext: boolean }) {
  return (
    <div className={`relative flex flex-col gap-5 ${hasNext ? "pr-16" : ""}`}>
      {slots.map((slot) => (
        <SlotCard key={slot.position} team={slot.team} />
      ))}
      {hasNext && (
        <div className="absolute right-10 top-1/4 bottom-1/4 w-6 border-t border-r border-b border-white/25 rounded-r pointer-events-none" />
      )}
    </div>
  );
}

// Reaching the next round is NOT always one-to-one. Two cases:
//
// "halve" — the next round has exactly half this round's matchup count
// (true for every ordinary round, e.g. Quarterfinals -> Semifinals): two
// source matchups' winners fill the next round's ONE destination matchup,
// one each. A line from a single matchup's own center never lands on
// anything here — only the MIDPOINT between a pair of matchups aligns with
// their shared destination. Drawn as a vertical bar spanning from one
// paired matchup's center to the other's (picking up exactly where each
// one's own local elbow, in MatchupPair above, already converges, since
// both sit at the same x), then one line from the bar's midpoint to the
// next round.
//
// "same" — the next round has the SAME matchup count as this one (true
// only for a 12-team bracket's First Round -> Quarterfinals: 4 play-in
// matchups, each feeding a *specific* Quarterfinal matchup alongside one of
// the 4 byes — standard seeded-bye convention, e.g. 5v12's winner meets the
// 1-seed, 6v11's meets the 2-seed, etc.). Here matchup i really does map
// straight across to matchup i, at the same height, so one plain line
// suffices with no convergence needed.
//
// Both only need the known column height and matchup counts — no DOM
// measurement — because justify-around gives every item an equal H/N
// slot and centers it there regardless of the item's own height, so a
// matchup's true center is always exactly columnHeight*(i+0.5)/N.
function AdvancementConnector({ yTop, yBottom }: { yTop: number; yBottom: number }) {
  const yMid = (yTop + yBottom) / 2;
  return (
    <>
      <div
        className="absolute right-10 w-6 border-r border-white/25 pointer-events-none"
        style={{ top: yTop, height: yBottom - yTop }}
      />
      <div
        className="absolute right-0 w-10 border-t border-white/25 pointer-events-none"
        style={{ top: yMid }}
      />
    </>
  );
}

function StraightConnector({ y }: { y: number }) {
  return (
    <div
      className="absolute right-0 w-10 border-t border-white/25 pointer-events-none"
      style={{ top: y }}
    />
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
  const roundSlotCounts = rounds.map((r) => (roundsMap.get(r) ?? []).length);
  const firstRoundSlotCount = roundSlotCounts[0];
  // Fixed height every round column shares, so justify-around naturally
  // centers sparser later rounds between their source matchups. Each
  // matchup pair's own content is ~164px tall (two 72px cards + gap-5), so
  // this leaves real breathing room around every pair rather than cards
  // overflowing their column.
  const columnHeight = (firstRoundSlotCount / 2) * 260;

  return (
    <div className="bg-[#0d0d20] border border-white/10 rounded-2xl p-8 md:p-10">
      <h2 className="text-base font-bold text-white mb-8">Playoff Bracket</h2>
      {/* justify-start, not center: a centered flex container that overflows
          scrolls to show its middle by default, making the start of the
          content (First Round) partly inaccessible on any screen narrower
          than the full bracket — which a 4-round bracket like the 12-team
          size reliably is. */}
      <div className="flex justify-start overflow-x-auto pb-2">
        {rounds.map((round, idx) => {
          const roundSlots = (roundsMap.get(round) ?? []).sort((a, b) => a.position - b.position);
          const matchups: BracketSlot[][] = [];
          for (let i = 0; i < roundSlots.length; i += 2) {
            matchups.push(roundSlots.slice(i, i + 2));
          }
          const hasNext = idx < totalRounds - 1;
          const nextCount = hasNext ? roundSlotCounts[idx + 1] : 0;
          const transition: "halve" | "same" | "none" = !hasNext
            ? "none"
            : nextCount === roundSlotCounts[idx] / 2
            ? "halve"
            : nextCount === roundSlotCounts[idx]
            ? "same"
            : "none";

          return (
            <div key={round} className="flex flex-col shrink-0">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                {roundLabel(firstRoundSlotCount, totalRounds, idx)}
              </h3>
              {/* Fixed-height note area on every column (empty when unused) so
                  every round's matchup box starts at the same Y regardless of
                  whether this particular column has a caption — needed for
                  the reach-line math below to line up correctly. */}
              <div className="h-8 mb-4 max-w-[200px]">
                {transition === "none" && hasNext && (
                  <p className="text-[10px] text-gray-600 italic leading-tight">
                    Winners advance into the next round.
                  </p>
                )}
              </div>
              <div className="relative flex flex-col justify-around" style={{ height: columnHeight }}>
                {matchups.map((pair, i) => (
                  <MatchupPair key={i} slots={pair} hasNext={hasNext} />
                ))}
                {transition === "halve" &&
                  Array.from({ length: matchups.length / 2 }, (_, j) => (
                    <AdvancementConnector
                      key={j}
                      yTop={(columnHeight * (2 * j + 0.5)) / matchups.length}
                      yBottom={(columnHeight * (2 * j + 1.5)) / matchups.length}
                    />
                  ))}
                {transition === "same" &&
                  matchups.map((_, i) => (
                    <StraightConnector key={i} y={(columnHeight * (i + 0.5)) / matchups.length} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
