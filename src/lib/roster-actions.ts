"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerTeam, type CallerTeam } from "@/lib/team-resolution";
import { DRAFT_SLOT_COUNT } from "@/lib/draft";
import type { SupabaseClient } from "@supabase/supabase-js";

type ActionResult = { error: string | null };

async function getConferenceDraftState(
  admin: SupabaseClient,
  seasonId: number,
  conferenceId: number
): Promise<{ isActive: boolean; startedAt: string | null }> {
  const { data } = await admin
    .from("conference_drafts")
    .select("is_active, started_at")
    .eq("season_id", seasonId)
    .eq("conference_id", conferenceId)
    .maybeSingle();

  return { isActive: data?.is_active ?? false, startedAt: data?.started_at ?? null };
}

export async function submitDraftPick(pokemonId: number): Promise<ActionResult> {
  const { team, error } = await resolveCallerTeam();
  if (!team) return { error };

  const admin = createAdminClient();
  const draftState = await getConferenceDraftState(admin, team.seasonId, team.conferenceId);

  if (!draftState.isActive) {
    return {
      error: draftState.startedAt
        ? "The draft has ended for your conference."
        : "The draft hasn't started yet for your conference.",
    };
  }

  const { error: rpcError } = await admin.rpc("submit_draft_pick", {
    p_season_id: team.seasonId,
    p_conference_id: team.conferenceId,
    p_team_id: team.teamId,
    p_pokemon_id: pokemonId,
    p_max_slots: DRAFT_SLOT_COUNT,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
  return { error: null };
}

async function submitFreeAgencyMove(
  team: CallerTeam,
  pokemonId: number,
  action: "add" | "drop"
): Promise<ActionResult> {
  const admin = createAdminClient();
  const draftState = await getConferenceDraftState(admin, team.seasonId, team.conferenceId);

  if (!draftState.startedAt) {
    return { error: "Free agency opens once your conference's draft has started." };
  }
  if (draftState.isActive) {
    return { error: "The draft is still in progress for your conference." };
  }

  const { error: rpcError } = await admin.rpc("submit_free_agency_move", {
    p_season_id: team.seasonId,
    p_conference_id: team.conferenceId,
    p_team_id: team.teamId,
    p_pokemon_id: pokemonId,
    p_action: action,
    p_max_slots: DRAFT_SLOT_COUNT,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
  return { error: null };
}

export async function addFreeAgent(pokemonId: number): Promise<ActionResult> {
  const { team, error } = await resolveCallerTeam();
  if (!team) return { error };
  return submitFreeAgencyMove(team, pokemonId, "add");
}

export async function dropFreeAgent(pokemonId: number): Promise<ActionResult> {
  const { team, error } = await resolveCallerTeam();
  if (!team) return { error };
  return submitFreeAgencyMove(team, pokemonId, "drop");
}
