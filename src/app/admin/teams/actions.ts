"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

export async function createTeam(prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const discord_id = (formData.get("discord_id") as string)?.trim();
  const team_name = (formData.get("team_name") as string)?.trim();
  const showdown_name = (formData.get("showdown_name") as string)?.trim();
  const logo_url = (formData.get("logo_url") as string)?.trim() || null;
  const conference_id = formData.get("conference_id") ? Number(formData.get("conference_id")) : null;
  const group_id = formData.get("group_id") ? Number(formData.get("group_id")) : null;
  const draft_position = formData.get("draft_position") ? Number(formData.get("draft_position")) : null;

  if (!discord_id) return { error: "Discord ID is required." };
  if (!team_name) return { error: "Team name is required." };
  if (!showdown_name) return { error: "Showdown name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("teams").insert({
    discord_id,
    team_name,
    showdown_name,
    logo_url,
    conference_id,
    group_id,
    draft_position,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

export async function updateTeam(prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const discord_id = (formData.get("discord_id") as string)?.trim();
  const team_name = (formData.get("team_name") as string)?.trim();
  const showdown_name = (formData.get("showdown_name") as string)?.trim();
  const logo_url = (formData.get("logo_url") as string)?.trim() || null;
  const conference_id = formData.get("conference_id") ? Number(formData.get("conference_id")) : null;
  const group_id = formData.get("group_id") ? Number(formData.get("group_id")) : null;
  const draft_position = formData.get("draft_position") ? Number(formData.get("draft_position")) : null;

  if (!discord_id) return { error: "Discord ID is required." };
  if (!team_name) return { error: "Team name is required." };
  if (!showdown_name) return { error: "Showdown name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("teams")
    .update({ discord_id, team_name, showdown_name, logo_url, conference_id, group_id, draft_position })
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
