import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    console.error("[auth/callback] No code in request");
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !user) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error);
    return NextResponse.redirect(`${origin}/`);
  }

  console.log("[auth/callback] user_metadata:", JSON.stringify(user.user_metadata));

  // Discord returns the username in full_name (e.g. "mcfeeds")
  const discordUsername =
    (user.user_metadata?.user_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined);

  if (!discordUsername) {
    console.error("[auth/callback] Could not resolve discord username from metadata");
    return NextResponse.redirect(`${origin}/team-not-found?username=unknown`);
  }

  // Scoped to the active season — a player who changed teams between
  // seasons has one team_members row per season, and an unscoped lookup
  // could match a stale row from a past season instead of reflecting
  // whether they're actually on a team right now.
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: membership } = activeSeason
    ? await supabase
        .from("team_members")
        .select("team_id")
        .ilike("discord_id", discordUsername)
        .eq("season_id", activeSeason.id)
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (membership) {
    return NextResponse.redirect(`${origin}/my-team`);
  }

  return NextResponse.redirect(
    `${origin}/team-not-found?username=${encodeURIComponent(discordUsername)}`
  );
}
