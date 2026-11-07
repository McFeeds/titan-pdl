"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

// Bracket sizes we support — each a clean power of 2 so every round pairs
// off evenly with no byes to handle.
const VALID_SIZES = [2, 4, 8, 16] as const;

// size=8 -> [8, 4, 2] (round 1 has 8 slots/4 matchups, final has 2 slots/1 matchup)
function slotCountsPerRound(size: number): number[] {
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
  const conference_id = Number(formData.get("conference_id"));
  const size = Number(formData.get("size"));

  if (!season_id || !conference_id) return { error: "Season and conference are required." };
  if (!VALID_SIZES.includes(size as (typeof VALID_SIZES)[number])) {
    return { error: "Bracket size must be 2, 4, 8, or 16 teams." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("playoff_bracket_slots")
    .select("id")
    .eq("season_id", season_id)
    .eq("conference_id", conference_id)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: "A bracket already exists for this season/conference. Clear it first to change the size." };
  }

  const rows: { season_id: number; conference_id: number; round: number; position: number; team_id: null }[] = [];
  slotCountsPerRound(size).forEach((slotsInRound, roundIdx) => {
    for (let position = 0; position < slotsInRound; position++) {
      rows.push({ season_id, conference_id, round: roundIdx + 1, position, team_id: null });
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
  const conference_id = Number(formData.get("conference_id"));
  const round = Number(formData.get("round"));
  const position = Number(formData.get("position"));
  const team_id = formData.get("team_id") ? Number(formData.get("team_id")) : null;

  if (!season_id || !conference_id || !round || Number.isNaN(position)) {
    return { error: "Missing slot identifiers." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("playoff_bracket_slots")
    .update({ team_id })
    .eq("season_id", season_id)
    .eq("conference_id", conference_id)
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
  const conference_id = Number(formData.get("conference_id"));
  if (!season_id || !conference_id) return { error: "Season and conference are required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("playoff_bracket_slots")
    .delete()
    .eq("season_id", season_id)
    .eq("conference_id", conference_id);

  if (error) return { error: error.message };

  revalidatePath("/admin/playoffs");
  revalidatePath("/schedules");
  return null;
}
