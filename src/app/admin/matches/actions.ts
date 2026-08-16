"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

export async function createMatch(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const week_number = Number(formData.get("week_number"));
  const home_team_id = Number(formData.get("home_team_id"));
  const away_team_id = Number(formData.get("away_team_id"));

  if (!season_id || !week_number || !home_team_id || !away_team_id) {
    return { error: "All fields are required." };
  }
  if (home_team_id === away_team_id) {
    return { error: "Home and away teams must be different." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("matches")
    .insert({ season_id, week_number, home_team_id, away_team_id });

  if (error) return { error: error.message };

  revalidatePath("/admin/matches");
  return null;
}

// Circle method: fixes the first team, rotates the rest one position per
// round. Each round pairs every team exactly once (a bye slot sits out when
// the group has an odd count), so "one match per team per week" falls out
// of the algorithm directly. Home/away flips every other round for basic
// fairness. Pure function — no DB access — so it's easy to reason about
// independent of the guard/insert logic in generateRoundRobinSchedule.
function generateRoundRobinPairings(
  teamIds: number[]
): { round: number; homeTeamId: number; awayTeamId: number }[] {
  const arr: (number | null)[] = [...teamIds];
  if (arr.length % 2 !== 0) arr.push(null); // bye
  const n = arr.length;
  const rounds = n - 1;
  const pairings: { round: number; homeTeamId: number; awayTeamId: number }[] = [];

  for (let round = 0; round < rounds; round++) {
    const flip = round % 2 === 1;
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null || b === null) continue;
      pairings.push(
        flip
          ? { round, homeTeamId: b, awayTeamId: a }
          : { round, homeTeamId: a, awayTeamId: b }
      );
    }
    // Rotate everything but the fixed first slot.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return pairings;
}

export async function generateRoundRobinSchedule(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const group_id = Number(formData.get("group_id"));
  const start_week = Number(formData.get("start_week")) || 1;

  if (!season_id || !group_id) return { error: "Season and group are required." };

  const admin = createAdminClient();

  const { data: teamSeasons, error: teamsError } = await admin
    .from("team_seasons")
    .select("team_id")
    .eq("season_id", season_id)
    .eq("group_id", group_id);

  if (teamsError) return { error: teamsError.message };

  const teamIds = (teamSeasons ?? []).map((ts) => ts.team_id);
  if (teamIds.length < 2) return { error: "This group needs at least 2 teams to generate a schedule." };

  const { data: existing, error: existingError } = await admin
    .from("matches")
    .select("home_team_id, away_team_id")
    .eq("season_id", season_id)
    .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`);

  if (existingError) return { error: existingError.message };

  const teamIdSet = new Set(teamIds);
  const scheduleAlreadySet = (existing ?? []).some(
    (m) => teamIdSet.has(m.home_team_id) && teamIdSet.has(m.away_team_id)
  );
  if (scheduleAlreadySet) {
    return { error: "This group already has matches scheduled this season — delete them first before regenerating." };
  }

  const pairings = generateRoundRobinPairings(teamIds);
  const rows = pairings.map((p) => ({
    season_id,
    week_number: start_week + p.round,
    home_team_id: p.homeTeamId,
    away_team_id: p.awayTeamId,
  }));

  const { error: insertError } = await admin.from("matches").insert(rows);
  if (insertError) return { error: insertError.message };

  revalidatePath("/admin/matches");
  revalidatePath("/schedules");
  revalidatePath("/my-team");
  return null;
}

export async function deleteMatch(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const admin = createAdminClient();
  await admin.from("matches").delete().eq("id", id);
  revalidatePath("/admin/matches");
  redirect("/admin/matches");
}

export async function upsertMatchGame(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const match_id = Number(formData.get("match_id"));
  const game_number = Number(formData.get("game_number"));
  const game_type = ((formData.get("game_type") as string) || "doubles") as "singles" | "doubles";
  const winner_team_id = formData.get("winner_team_id") ? Number(formData.get("winner_team_id")) : null;
  const replay_url = (formData.get("replay_url") as string)?.trim() || null;

  if (!match_id || !game_number) return { error: "match_id and game_number are required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("match_games")
    .upsert({ match_id, game_number, game_type, winner_team_id, replay_url }, { onConflict: "match_id,game_type,game_number" });

  if (error) return { error: error.message };

  revalidatePath(`/admin/matches/${match_id}`);
  return null;
}

export async function addMatchGamePokemon(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const match_game_id = Number(formData.get("match_game_id"));
  const match_id = Number(formData.get("match_id"));
  const team_id = Number(formData.get("team_id"));
  const pokemon_id = Number(formData.get("pokemon_id"));
  const kills = Number(formData.get("kills") ?? 0);
  const deaths = Number(formData.get("deaths") ?? 0);

  if (!match_game_id || !team_id || !pokemon_id) {
    return { error: "Game, team, and Pokémon are required." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("match_game_pokemon")
    .insert({ match_game_id, team_id, pokemon_id, kills, deaths });

  if (error) return { error: error.message };

  revalidatePath(`/admin/matches/${match_id}`);
  return null;
}

export async function updateMatchGamePokemon(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const match_id = Number(formData.get("match_id"));
  const kills = Number(formData.get("kills") ?? 0);
  const deaths = Number(formData.get("deaths") ?? 0);

  const admin = createAdminClient();
  await admin.from("match_game_pokemon").update({ kills, deaths }).eq("id", id);

  revalidatePath(`/admin/matches/${match_id}`);
}

export async function removeMatchGamePokemon(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const match_id = Number(formData.get("match_id"));

  const admin = createAdminClient();
  await admin.from("match_game_pokemon").delete().eq("id", id);

  revalidatePath(`/admin/matches/${match_id}`);
}

export async function clearMatchResults(formData: FormData) {
  await requireAdmin();

  const match_id = Number(formData.get("match_id"));
  const admin = createAdminClient();

  // Deleting match_games cascades to match_game_pokemon
  await admin.from("match_games").delete().eq("match_id", match_id);
  await admin.from("matches").update({ played_at: null }).eq("id", match_id);

  revalidatePath(`/admin/matches/${match_id}`);
  revalidatePath("/my-team");
  revalidatePath("/schedules");
}
