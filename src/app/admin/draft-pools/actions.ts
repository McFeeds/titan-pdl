"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

function revalidateAll() {
  revalidatePath("/admin/draft-pools");
  revalidatePath("/admin/teams");
  revalidatePath("/draft-pools");
  revalidatePath("/my-team");
}

export async function createDraftPool(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const season_id = Number(formData.get("season_id"));
  const name = (formData.get("name") as string)?.trim();
  if (!season_id || !name) return { error: "Season and name are required." };

  const admin = createAdminClient();
  const { error } = await admin.from("draft_pools").insert({ season_id, name });
  if (error) return { error: error.message };

  revalidateAll();
  return null;
}

export async function renameDraftPool(poolId: number, name: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("draft_pools").update({ name }).eq("id", poolId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteDraftPool(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const admin = createAdminClient();
  // Clear membership first so the FK doesn't block deleting an otherwise-empty pool.
  await admin.from("team_seasons").update({ draft_pool_id: null }).eq("draft_pool_id", id);
  await admin.from("draft_pools").delete().eq("id", id);
  revalidateAll();
}

export async function assignTeamsToPool(poolId: number, seasonId: number, teamIds: number[]) {
  await requireAdmin();
  if (teamIds.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .update({ draft_pool_id: poolId })
    .eq("season_id", seasonId)
    .in("team_id", teamIds);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function assignGroupToPool(poolId: number, seasonId: number, groupId: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .update({ draft_pool_id: poolId })
    .eq("season_id", seasonId)
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function assignConferenceToPool(poolId: number, seasonId: number, conferenceId: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .update({ draft_pool_id: poolId })
    .eq("season_id", seasonId)
    .eq("conference_id", conferenceId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function removeTeamFromPool(seasonId: number, teamId: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .update({ draft_pool_id: null })
    .eq("season_id", seasonId)
    .eq("team_id", teamId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateTeamDraftPosition(seasonId: number, teamId: number, draftPosition: number | null) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .update({ draft_position: draftPosition })
    .eq("season_id", seasonId)
    .eq("team_id", teamId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function setDraftPoolActive(poolId: number, isActive: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_draft_pool_active", {
    p_draft_pool_id: poolId,
    p_is_active: isActive,
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function forceEndTeamDraft(seasonId: number, teamId: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.rpc("end_team_draft", { p_season_id: seasonId, p_team_id: teamId });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function reactivateTeamDraft(seasonId: number, teamId: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reactivate_team_draft", { p_season_id: seasonId, p_team_id: teamId });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function revertDraftToPick(seasonId: number, poolId: number, keepUpToPickNumber: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.rpc("revert_draft_to_pick", {
    p_season_id: seasonId,
    p_draft_pool_id: poolId,
    p_keep_up_to_pick_number: keepUpToPickNumber,
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}
