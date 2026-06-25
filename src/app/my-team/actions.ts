"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getDiscordUsername } from "@/lib/supabase/admin";

export async function updateRosterNickname(
  pokemonId: number,
  seasonId: number,
  nickname: string | null
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { error: "Not authenticated" };

  // Verify the user is on a team this season
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", seasonId)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "Not on a team this season" };

  // Admin client bypasses RLS (rosters table has no write policy)
  const admin = createAdminClient();
  const { error } = await admin
    .from("rosters")
    .update({ nickname: nickname || null })
    .eq("pokemon_id", pokemonId)
    .eq("team_id", membership.team_id)
    .eq("season_id", seasonId);

  if (error) return { error: error.message };
  return { error: null };
}
