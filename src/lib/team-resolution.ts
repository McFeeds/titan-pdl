import { createClient } from "@/lib/supabase/server";
import { getDiscordUsername } from "@/lib/supabase/admin";

export interface CallerTeam {
  teamId: number;
  conferenceId: number;
  draftPoolId: number | null;
  draftPosition: number | null;
  seasonId: number;
}

// Resolves the logged-in user's team + conference for the active season.
// Shared by every player-facing server action so team/conference identity
// always comes from the authenticated session, never a client-supplied value.
export async function resolveCallerTeam(): Promise<{ team: CallerTeam | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { team: null, error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { team: null, error: "Not authenticated" };

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!activeSeason) return { team: null, error: "No active season found" };

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", activeSeason.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return { team: null, error: "You are not on a team this season" };

  const { data: placement } = await supabase
    .from("team_seasons")
    .select("conference_id, draft_pool_id, draft_position")
    .eq("team_id", membership.team_id)
    .eq("season_id", activeSeason.id)
    .maybeSingle();
  if (!placement) return { team: null, error: "Your team has no conference assigned this season" };

  return {
    team: {
      teamId: membership.team_id,
      conferenceId: placement.conference_id,
      draftPoolId: placement.draft_pool_id,
      draftPosition: placement.draft_position,
      seasonId: activeSeason.id,
    },
    error: null,
  };
}
