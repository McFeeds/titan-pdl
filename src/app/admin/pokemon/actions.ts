"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

export async function updatePointValue(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const point_value = Number(formData.get("point_value"));

  if (isNaN(id) || isNaN(point_value) || point_value < 0) return;

  const admin = createAdminClient();
  await admin.from("pokemon").update({ point_value }).eq("id", id);
  revalidatePath("/admin/pokemon");
}
