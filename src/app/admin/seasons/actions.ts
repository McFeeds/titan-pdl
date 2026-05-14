"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

type State = { error?: string } | null;

export async function createSeason(prevState: State, formData: FormData): Promise<State> {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Season name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("seasons").insert({ name, is_active: false });

  if (error) return { error: error.message };

  revalidatePath("/admin/seasons");
  return null;
}

export async function setActiveSeason(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const admin = createAdminClient();

  // Deactivate all, then activate the selected one
  await admin.from("seasons").update({ is_active: false }).neq("id", -1);
  await admin.from("seasons").update({ is_active: true }).eq("id", id);

  revalidatePath("/admin/seasons");
}

export async function deleteSeason(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const admin = createAdminClient();
  await admin.from("seasons").delete().eq("id", id);
  revalidatePath("/admin/seasons");
}
