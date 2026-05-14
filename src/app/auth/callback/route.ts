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

  // Discord can put the username in different fields depending on account type
  const discordUsername =
    (user.user_metadata?.user_name as string | undefined) ||
    (user.user_metadata?.preferred_username as string | undefined);

  if (!discordUsername) {
    console.error("[auth/callback] Could not resolve discord username from metadata");
    return NextResponse.redirect(`${origin}/team-not-found?username=unknown`);
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("discord_id", discordUsername)
    .single();

  if (team) {
    return NextResponse.redirect(`${origin}/my-team`);
  }

  return NextResponse.redirect(
    `${origin}/team-not-found?username=${encodeURIComponent(discordUsername)}`
  );
}
