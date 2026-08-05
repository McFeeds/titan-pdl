// Shared draft rules — kept in one place so the planner and the live draft
// board can't drift out of sync.
// DRAFT_BUDGET is only a fallback default (used by the standalone draft
// planner tool); the live draft board and server actions use each season's
// real `point_budget` from the database instead.
export const DRAFT_BUDGET = 115;
export const DRAFT_SLOT_COUNT = 12;

// Fired by DraftTurnAlert's "Go to Draft" link so the draft-pools page can
// force itself back to the Pool tab even when it's already mounted (a plain
// same-URL <Link> navigation is a no-op and won't reset client-side tab state).
export const GO_TO_DRAFT_POOL_EVENT = "titan-pdl:go-to-draft-pool";

export interface DraftTeamState {
  id: number;
  draftPosition: number | null;
  draftEnded: boolean;
  picksMade: number;
}

// Snake draft: whichever not-yet-ended team is furthest behind on their own
// picks goes next (ties broken by draftPosition, ascending on odd "rounds" —
// picksMade+1 — and descending on even ones). This intentionally ignores
// ended teams entirely rather than trying to replay history round-by-round:
// an earlier count-based version assumed every team's Nth pick landed
// exactly in round N of a perfectly interleaved sequence, which broke as
// soon as that assumption was violated (an admin override out of turn, or a
// team ending with an irregular pick count) — it could still hand the turn
// back to a team that had already ended. Excluding ended teams outright
// makes that class of bug structurally impossible.
// Mirrored server-side in compute_on_clock_team() (supabase/migrations/20260808000000_auto_end_stuck_teams.sql)
// — keep both in sync if this logic ever changes.
export function computeOnClockTeamId(
  teams: DraftTeamState[],
  slotCount: number = DRAFT_SLOT_COUNT
): number | null {
  const eligible = teams.filter(
    (t): t is DraftTeamState & { draftPosition: number } =>
      t.draftPosition !== null && !t.draftEnded && t.picksMade < slotCount
  );
  if (eligible.length === 0) return null; // draft complete

  const minPicks = Math.min(...eligible.map((t) => t.picksMade));
  const round = minPicks + 1;
  const ascending = round % 2 === 1;
  const candidates = eligible
    .filter((t) => t.picksMade === minPicks)
    .sort((a, b) => (ascending ? a.draftPosition - b.draftPosition : b.draftPosition - a.draftPosition));
  return candidates[0].id;
}
