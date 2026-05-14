import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !user) {
    return NextResponse.redirect(`${origin}/`);
  }

  const discordUsername = user.user_metadata?.user_name as string | undefined;

  if (!discordUsername) {
    return NextResponse.redirect(`${origin}/`);
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
