"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

export async function addRosterEntry(prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const team_id = Number(formData.get("team_id"));
  const pokemon_id = Number(formData.get("pokemon_id"));
  const conference_id = Number(formData.get("conference_id"));

  if (!season_id || !team_id || !pokemon_id || !conference_id) {
    return { error: "All fields are required." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("rosters")
    .insert({ season_id, team_id, pokemon_id, conference_id });

  if (error) return { error: error.message };

  revalidatePath("/admin/rosters");
  return null;
}

export async function removeRosterEntry(formData: FormData) {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const conference_id = Number(formData.get("conference_id"));
  const pokemon_id = Number(formData.get("pokemon_id"));

  const admin = createAdminClient();
  await admin
    .from("rosters")
    .delete()
    .eq("season_id", season_id)
    .eq("conference_id", conference_id)
    .eq("pokemon_id", pokemon_id);

  revalidatePath("/admin/rosters");
}
