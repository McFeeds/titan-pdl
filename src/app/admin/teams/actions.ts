"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

export async function createTeam(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const team_name = (formData.get("team_name") as string)?.trim();
  const logo_url = (formData.get("logo_url") as string)?.trim() || null;

  if (!team_name) return { error: "Team name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("teams").insert({ team_name, logo_url });

  if (error) return { error: error.message };

  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function updateTeam(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const team_name = (formData.get("team_name") as string)?.trim();
  const logo_url = (formData.get("logo_url") as string)?.trim() || null;

  if (!team_name) return { error: "Team name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("teams")
    .update({ team_name, logo_url })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const admin = createAdminClient();
  await admin.from("teams").delete().eq("id", id);
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function upsertTeamSeason(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const team_id = Number(formData.get("team_id"));
  const season_id = Number(formData.get("season_id"));
  const conference_id = formData.get("conference_id") ? Number(formData.get("conference_id")) : null;
  const group_id = formData.get("group_id") ? Number(formData.get("group_id")) : null;
  const draft_pool_id = formData.get("draft_pool_id") ? Number(formData.get("draft_pool_id")) : null;
  const draft_position = formData.get("draft_position") ? Number(formData.get("draft_position")) : null;

  if (!season_id) return { error: "No active season found." };
  if (!conference_id) return { error: "Conference is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_seasons")
    .upsert({ team_id, season_id, conference_id, group_id, draft_pool_id, draft_position });

  if (error) return { error: error.message };

  revalidatePath(`/admin/teams/${team_id}`);
  return null;
}

export async function addTeamMember(_prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const team_id = Number(formData.get("team_id"));
  const season_id = Number(formData.get("season_id"));
  const discord_id = (formData.get("discord_id") as string)?.trim();
  const showdown_name = (formData.get("showdown_name") as string)?.trim() || null;
  const role = (formData.get("role") as string) || "owner";

  if (!discord_id) return { error: "Discord username is required." };
  if (!season_id) return { error: "No active season found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_members")
    .insert({ team_id, season_id, discord_id, showdown_name, role });

  if (error) return { error: error.message };

  revalidatePath(`/admin/teams/${team_id}`);
  return null;
}

export async function updateTeamMember(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const team_id = Number(formData.get("team_id"));
  const showdown_name = (formData.get("showdown_name") as string)?.trim() || null;
  const role = formData.get("role") as string | null;

  const admin = createAdminClient();
  await admin
    .from("team_members")
    .update({ showdown_name, ...(role ? { role } : {}) })
    .eq("id", id);

  revalidatePath(`/admin/teams/${team_id}`);
}

export async function removeTeamMember(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const team_id = Number(formData.get("team_id"));

  const admin = createAdminClient();
  await admin.from("team_members").delete().eq("id", id);

  revalidatePath(`/admin/teams/${team_id}`);
}
