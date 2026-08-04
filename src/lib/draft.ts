// Shared draft rules — kept in one place so the planner and the live draft
// board can't drift out of sync.
// DRAFT_BUDGET is only a fallback default (used by the standalone draft
// planner tool); the live draft board and server actions use each season's
// real `point_budget` from the database instead.
export const DRAFT_BUDGET = 115;
export const DRAFT_SLOT_COUNT = 12;

// Snake draft: odd rounds go draftPosition 1→N, even rounds go N→1.
// Mirrored server-side in submit_draft_pick() (supabase/migrations/20260804000000_free_agency.sql)
// — keep both in sync if this logic ever changes.
export function computeOnClockPosition(picksSoFar: number, teamCount: number): number | null {
  if (teamCount === 0) return null;
  const totalSlots = teamCount * DRAFT_SLOT_COUNT;
  if (picksSoFar >= totalSlots) return null; // draft complete
  const nextPick = picksSoFar + 1;
  const round = Math.ceil(nextPick / teamCount);
  const posInRound = ((nextPick - 1) % teamCount) + 1;
  return round % 2 === 1 ? posInRound : teamCount + 1 - posInRound;
}
