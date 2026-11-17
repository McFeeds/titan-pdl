// Shared playoff-bracket math — used by the public bracket display, the
// admin bracket editor, and the result-submission server action, so the
// "which slot does a round's winner advance into" logic can't drift out of
// sync between where it's drawn and where it's actually applied.
//
// A round transition is one of:
//   "halve" — the next round has exactly half this round's matchup count
//             (every ordinary round, e.g. Quarterfinals -> Semifinals).
//             Two source matchups' winners fill the next round's ONE
//             destination matchup, one each: matchup i's winner lands in
//             slot i of the next round (which, paired with matchup i+1's
//             winner in slot i+1 if i is even/odd respectively, forms that
//             round's own matchups the normal way).
//   "same"  — the next round has the SAME matchup count as this one (only
//             a 12-team bracket's First Round -> Quarterfinals: each
//             play-in matchup's winner meets one specific bye seed, a 1:1
//             mapping by index, just not a halving one). Matchup i's
//             winner lands in one of slots 2i/2i+1 of the next round —
//             whichever the admin left empty for it (the bye occupies the
//             other).
//   "none"  — no determined relationship (shouldn't occur for any bracket
//             size this app generates, but handled defensively).

export type RoundTransition = "halve" | "same" | "none";

export function classifyTransition(currentMatchupCount: number, nextMatchupCount: number): RoundTransition {
  if (nextMatchupCount === currentMatchupCount / 2) return "halve";
  if (nextMatchupCount === currentMatchupCount) return "same";
  return "none";
}

// Round labels, keyed by "<round-1 slot count>-<total rounds>" — the only
// two numbers needed to disambiguate every size the admin editor supports,
// including the 12-team bracket sharing round 1's slot count (8) with the
// 8-team bracket but needing one more round for its bye structure.
const ROUND_LABELS: Record<string, string[]> = {
  "2-1": ["Final"],
  "4-2": ["Semifinals", "Final"],
  "8-3": ["Quarterfinals", "Semifinals", "Final"],
  "8-4": ["First Round", "Quarterfinals", "Semifinals", "Final"],
  "16-4": ["Round of 16", "Quarterfinals", "Semifinals", "Final"],
};

export function roundLabel(firstRoundSlotCount: number, totalRounds: number, roundIdx: number): string {
  const key = `${firstRoundSlotCount}-${totalRounds}`;
  return ROUND_LABELS[key]?.[roundIdx] ?? `Round ${roundIdx + 1}`;
}

export interface BracketSlotRow {
  round: number;
  position: number;
  team_id: number | null;
}

// Where a round's winner (matchup match_index) should land in the next
// round, given the current slot layout there. Returns null if there's no
// next round or no determined mapping ("none").
export function destinationSlot(
  allSlots: BracketSlotRow[],
  currentRound: number,
  matchIndex: number
): { round: number; position: number } | null {
  const roundsPresent = [...new Set(allSlots.map((s) => s.round))].sort((a, b) => a - b);
  const idx = roundsPresent.indexOf(currentRound);
  if (idx === -1 || idx === roundsPresent.length - 1) return null; // no next round (Final)

  const nextRound = roundsPresent[idx + 1];
  const currentCount = allSlots.filter((s) => s.round === currentRound).length / 2;
  const nextCount = allSlots.filter((s) => s.round === nextRound).length / 2;
  const transition = classifyTransition(currentCount, nextCount);

  if (transition === "halve") {
    return { round: nextRound, position: matchIndex };
  }

  if (transition === "same") {
    const slotA = 2 * matchIndex;
    const slotB = 2 * matchIndex + 1;
    const occupantA = allSlots.find((s) => s.round === nextRound && s.position === slotA);
    const occupantB = allSlots.find((s) => s.round === nextRound && s.position === slotB);
    // Prefer whichever of the pair is still empty (the other is presumably
    // a bye the admin already placed); default to the first slot if both
    // are empty, or overwrite the first if both are somehow already full.
    if (occupantA && occupantA.team_id === null) return { round: nextRound, position: slotA };
    if (occupantB && occupantB.team_id === null) return { round: nextRound, position: slotB };
    return { round: nextRound, position: slotA };
  }

  return null;
}
