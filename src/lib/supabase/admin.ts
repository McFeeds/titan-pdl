import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function getDiscordUsername(userMetadata: Record<string, unknown>): string | undefined {
  return (
    (userMetadata?.user_name as string | undefined) ||
    (userMetadata?.full_name as string | undefined)
  );
}

export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) throw new Error("Unauthorized");

  const { data: admin } = await supabase
    .from("admins")
    .select("discord_id")
    .ilike("discord_id", discordUsername)
    .single();

  if (!admin) throw new Error("Unauthorized");

  return discordUsername;
}
