"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

// Bracket sizes we support, league-wide (one bracket per season).
const VALID_SIZES = [2, 4, 8, 12, 16] as const;

// size=8  -> [8, 4, 2]    (round 1 has 8 slots/4 matchups, final has 2 slots)
// size=12 -> [8, 8, 4, 2] (top 4 seeds bye straight into round 2, so round 1
//            is only the bottom 8 seeds playing in, and round 2 holds all 8
//            teams that advance — the 4 byes plus the 4 round-1 winners —
//            rather than round 2 halving round 1 like every other size)
function slotCountsPerRound(size: number): number[] {
  if (size === 12) return [8, 8, 4, 2];
  const rounds: number[] = [];
  let n = size;
  while (n >= 2) {
    rounds.push(n);
    n = n / 2;
  }
  return rounds;
}

export async function createBracket(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const size = Number(formData.get("size"));

  if (!season_id) return { error: "Season is required." };
  if (!VALID_SIZES.includes(size as (typeof VALID_SIZES)[number])) {
    return { error: "Bracket size must be 2, 4, 8, 12, or 16 teams." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("playoff_bracket_slots")
    .select("id")
    .eq("season_id", season_id)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: "A bracket already exists for this season. Clear it first to change the size." };
  }

  const rows: { season_id: number; round: number; position: number; team_id: null }[] = [];
  slotCountsPerRound(size).forEach((slotsInRound, roundIdx) => {
    for (let position = 0; position < slotsInRound; position++) {
      rows.push({ season_id, round: roundIdx + 1, position, team_id: null });
    }
  });

  const { error } = await admin.from("playoff_bracket_slots").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/admin/playoffs");
  revalidatePath("/schedules");
  return null;
}

export async function setBracketSlotTeam(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const round = Number(formData.get("round"));
  const position = Number(formData.get("position"));
  const team_id = formData.get("team_id") ? Number(formData.get("team_id")) : null;

  if (!season_id || !round || Number.isNaN(position)) {
    return { error: "Missing slot identifiers." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("playoff_bracket_slots")
    .update({ team_id })
    .eq("season_id", season_id)
    .eq("round", round)
    .eq("position", position);

  if (error) return { error: error.message };

  revalidatePath("/admin/playoffs");
  revalidatePath("/schedules");
  return null;
}

export async function clearBracket(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  if (!season_id) return { error: "Season is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("playoff_bracket_slots")
    .delete()
    .eq("season_id", season_id);

  if (error) return { error: error.message };

  revalidatePath("/admin/playoffs");
  revalidatePath("/schedules");
  return null;
}
