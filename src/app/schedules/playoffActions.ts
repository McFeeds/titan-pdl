"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getDiscordUsername } from "@/lib/supabase/admin";
import { destinationSlot } from "@/lib/playoffBracket";

type State = { error?: string } | null;

// Submits a binary winner + optional replay links for one playoff bracket
// matchup, then auto-advances the winner into the correct next-round slot.
// Deliberately NOT the full replay-log analyzer used for regular-season
// matches — no per-game parsing, kills/deaths, or singles/doubles
// breakdown, just a result the two participating teams agree on.
export async function submitPlayoffResult(_prevState: State, formData: FormData): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { error: "Not authenticated" };

  const season_id = Number(formData.get("season_id"));
  const round = Number(formData.get("round"));
  const match_index = Number(formData.get("match_index"));
  const winner_team_id = Number(formData.get("winner_team_id"));
  const replayUrls = (formData.getAll("replay_url") as string[])
    .map((u) => u.trim())
    .filter(Boolean);

  if (!season_id || !round || Number.isNaN(match_index) || !winner_team_id) {
    return { error: "Missing required fields." };
  }

  const admin = createAdminClient();

  // Both slots in this matchup must already have real teams assigned.
  const { data: slotRows } = await admin
    .from("playoff_bracket_slots")
    .select("position, team_id")
    .eq("season_id", season_id)
    .eq("round", round)
    .in("position", [2 * match_index, 2 * match_index + 1]);

  const teamIds = (slotRows ?? [])
    .map((s) => s.team_id)
    .filter((id): id is number => id !== null);

  if (teamIds.length !== 2) {
    return { error: "Both teams must be set for this matchup before submitting a result." };
  }
  if (!teamIds.includes(winner_team_id)) {
    return { error: "Winner must be one of the two teams in this matchup." };
  }

  // Caller must belong to one of the two teams for this season.
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", season_id)
    .in("team_id", teamIds)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { error: "You are not a member of either team in this matchup." };
  }

  const { data: existing } = await admin
    .from("playoff_matches")
    .select("id")
    .eq("season_id", season_id)
    .eq("round", round)
    .eq("match_index", match_index)
    .maybeSingle();

  if (existing) {
    return { error: "A result has already been submitted for this match. Contact an admin to make changes." };
  }

  const { data: matchRow, error: insertError } = await admin
    .from("playoff_matches")
    .insert({ season_id, round, match_index, winner_team_id })
    .select("id")
    .single();

  if (insertError || !matchRow) {
    return { error: insertError?.message ?? "Failed to save result." };
  }

  if (replayUrls.length > 0) {
    const replayRows = replayUrls.map((url, i) => ({
      playoff_match_id: matchRow.id as number,
      url: url.startsWith("http") ? url : `https://${url}`,
      position: i,
    }));
    const { error: replayError } = await admin.from("playoff_match_replays").insert(replayRows);
    if (replayError) return { error: `Result saved, but replay links failed to save: ${replayError.message}` };
  }

  // Auto-advance the winner into the next round, if the bracket has one.
  const { data: allSlots } = await admin
    .from("playoff_bracket_slots")
    .select("round, position, team_id")
    .eq("season_id", season_id);

  const dest = destinationSlot(allSlots ?? [], round, match_index);
  if (dest) {
    await admin
      .from("playoff_bracket_slots")
      .update({ team_id: winner_team_id })
      .eq("season_id", season_id)
      .eq("round", dest.round)
      .eq("position", dest.position);
  }

  revalidatePath("/schedules");
  revalidatePath("/admin/playoffs");
  return null;
}
