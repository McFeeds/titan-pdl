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
