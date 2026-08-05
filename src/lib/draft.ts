// Shared draft rules — kept in one place so the planner and the live draft
// board can't drift out of sync.
// DRAFT_BUDGET is only a fallback default (used by the standalone draft
// planner tool); the live draft board and server actions use each season's
// real `point_budget` from the database instead.
export const DRAFT_BUDGET = 115;
export const DRAFT_SLOT_COUNT = 12;

export interface DraftTeamState {
  id: number;
  draftPosition: number | null;
  draftEnded: boolean;
  picksMade: number;
}

// Snake draft: odd rounds go draftPosition 1→N, even rounds go N→1. Skips a
// team's remaining rounds once their draft has ended — their already-made
// picks still count toward picksSoFar, only future rounds are skipped.
// Mirrored server-side in compute_on_clock_team() (supabase/migrations/20260805000000_draft_end_and_revert.sql)
// — keep both in sync if this logic ever changes.
export function computeOnClockTeamId(
  teams: DraftTeamState[],
  picksSoFar: number,
  slotCount: number = DRAFT_SLOT_COUNT
): number | null {
  const positioned = teams.filter(
    (t): t is DraftTeamState & { draftPosition: number } => t.draftPosition !== null
  );
  let count = 0;
  for (let round = 1; round <= slotCount; round++) {
    const ascending = round % 2 === 1;
    const ordered = [...positioned].sort((a, b) =>
      ascending ? a.draftPosition - b.draftPosition : b.draftPosition - a.draftPosition
    );
    for (const team of ordered) {
      if (team.draftEnded && round > team.picksMade) continue; // no slot left for them
      if (count === picksSoFar) return team.id;
      count++;
    }
  }
  return null; // draft complete
}
