"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerTeam, type CallerTeam } from "@/lib/team-resolution";
import { DRAFT_SLOT_COUNT } from "@/lib/draft";
import type { SupabaseClient } from "@supabase/supabase-js";

type ActionResult = { error: string | null };

async function getDraftPoolState(
  admin: SupabaseClient,
  draftPoolId: number | null
): Promise<{ isActive: boolean; startedAt: string | null; completedAt: string | null }> {
  if (draftPoolId === null) return { isActive: false, startedAt: null, completedAt: null };

  const { data } = await admin
    .from("draft_pools")
    .select("is_active, started_at, completed_at")
    .eq("id", draftPoolId)
    .maybeSingle();

  return {
    isActive: data?.is_active ?? false,
    startedAt: data?.started_at ?? null,
    completedAt: data?.completed_at ?? null,
  };
}

export async function submitDraftPick(pokemonId: number): Promise<ActionResult> {
  const { team, error } = await resolveCallerTeam();
  if (!team) return { error };

  const admin = createAdminClient();
  const draftState = await getDraftPoolState(admin, team.draftPoolId);

  if (!draftState.isActive) {
    return {
      error: draftState.completedAt
        ? "The draft has ended for your pool."
        : draftState.startedAt
          ? "The draft is currently paused for your pool."
          : "The draft hasn't started yet for your pool.",
    };
  }

  const { error: rpcError } = await admin.rpc("submit_draft_pick", {
    p_season_id: team.seasonId,
    p_draft_pool_id: team.draftPoolId,
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
  const draftState = await getDraftPoolState(admin, team.draftPoolId);

  // Gated on completedAt specifically, not just "started and not currently
  // active" — a paused or prematurely-ended draft (picks still outstanding)
  // must not open free agency early.
  if (!draftState.completedAt) {
    return {
      error: draftState.startedAt
        ? "Free agency opens once every team in your pool has finished drafting."
        : "Free agency opens once your draft pool has started.",
    };
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

export async function endMyDraft(): Promise<ActionResult> {
  const { team, error } = await resolveCallerTeam();
  if (!team) return { error };

  const admin = createAdminClient();
  const draftState = await getDraftPoolState(admin, team.draftPoolId);
  if (!draftState.isActive) {
    return { error: "The draft isn't active for your pool." };
  }

  const { error: rpcError } = await admin.rpc("end_team_draft", {
    p_season_id: team.seasonId,
    p_team_id: team.teamId,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
  return { error: null };
}
