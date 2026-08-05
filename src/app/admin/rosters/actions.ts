"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import { DRAFT_SLOT_COUNT } from "@/lib/draft";

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

  const { data: draftState } = await admin
    .from("conference_drafts")
    .select("is_active")
    .eq("season_id", season_id)
    .eq("conference_id", conference_id)
    .maybeSingle();

  if (draftState?.is_active) {
    // Draft is live for this conference — record it as a pick so the
    // public board's turn tracker advances, in addition to the roster add.
    const { error } = await admin.rpc("record_draft_pick", {
      p_season_id: season_id,
      p_conference_id: conference_id,
      p_team_id: team_id,
      p_pokemon_id: pokemon_id,
      p_max_slots: DRAFT_SLOT_COUNT,
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from("rosters")
      .insert({ season_id, team_id, pokemon_id, conference_id });
    if (error) return { error: error.message };
  }

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

  // Clean up the matching pick if this was logged as part of a live draft,
  // so a corrected pick doesn't leave a permanent gap in the turn order.
  await admin
    .from("draft_log")
    .delete()
    .eq("season_id", season_id)
    .eq("conference_id", conference_id)
    .eq("pokemon_id", pokemon_id);

  revalidatePath("/admin/rosters");
}

export async function setDraftActive(seasonId: number, conferenceId: number, isActive: boolean) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_conference_draft_active", {
    p_season_id: seasonId,
    p_conference_id: conferenceId,
    p_is_active: isActive,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/rosters");
}

export async function forceEndTeamDraft(seasonId: number, teamId: number) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin.rpc("end_team_draft", {
    p_season_id: seasonId,
    p_team_id: teamId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/rosters");
  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
}

export async function reactivateTeamDraft(seasonId: number, teamId: number) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin.rpc("reactivate_team_draft", {
    p_season_id: seasonId,
    p_team_id: teamId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/rosters");
  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
}

export async function revertDraftToPick(seasonId: number, conferenceId: number, keepUpToPickNumber: number) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin.rpc("revert_draft_to_pick", {
    p_season_id: seasonId,
    p_conference_id: conferenceId,
    p_keep_up_to_pick_number: keepUpToPickNumber,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/rosters");
  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
}
