"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getDiscordUsername } from "@/lib/supabase/admin";
import { parseShowdownLog, nameToSlug } from "@/lib/showdown-log-parser";

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

export async function submitMatchResults(
  matchId: number,
  games: { gameNumber: number; replayUrl: string }[]
): Promise<{ error: string | null }> {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Fetch match details
  const { data: match } = await admin
    .from("matches")
    .select("id, home_team_id, away_team_id, season_id")
    .eq("id", matchId)
    .single();

  if (!match) return { error: "Match not found" };

  // Verify user is a member of one of the teams
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", match.season_id)
    .in("team_id", [match.home_team_id, match.away_team_id])
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "You are not a member of either team in this match" };

  // Guard: don't overwrite existing game data
  const { data: existingGames } = await admin
    .from("match_games")
    .select("id")
    .eq("match_id", matchId)
    .limit(1);

  if (existingGames && existingGames.length > 0) {
    return { error: "Results already exist for this match. Contact an admin to make changes." };
  }

  // Fetch showdown names for both teams
  const { data: teamMembers } = await admin
    .from("team_members")
    .select("team_id, showdown_name")
    .in("team_id", [match.home_team_id, match.away_team_id])
    .eq("season_id", match.season_id)
    .not("showdown_name", "is", null);

  const membersByTeam: Record<number, string[]> = {};
  for (const tm of teamMembers ?? []) {
    if (!tm.showdown_name) continue;
    const tid = tm.team_id as number;
    if (!membersByTeam[tid]) membersByTeam[tid] = [];
    membersByTeam[tid].push(tm.showdown_name.toLowerCase());
  }

  // Process each game
  for (const game of games) {
    const rawUrl = game.replayUrl.trim();
    if (!rawUrl) continue;

    // Normalize and fetch the log
    const replayUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const logUrl = replayUrl.endsWith(".log") ? replayUrl : `${replayUrl}.log`;

    let logText: string;
    try {
      const res = await fetch(logUrl, { cache: "no-store" });
      if (!res.ok) {
        return { error: `Could not fetch replay for game ${game.gameNumber} (HTTP ${res.status}). Check the URL and try again.` };
      }
      logText = await res.text();
    } catch {
      return { error: `Failed to load replay for game ${game.gameNumber}. Check the URL and your connection.` };
    }

    const parsed = parseShowdownLog(logText);

    // Match player usernames to teams
    let p1TeamId: number | null = null;
    let p2TeamId: number | null = null;

    for (const [teamIdStr, names] of Object.entries(membersByTeam)) {
      const tid = Number(teamIdStr);
      if (names.includes(parsed.p1Username.toLowerCase())) p1TeamId = tid;
      if (names.includes(parsed.p2Username.toLowerCase())) p2TeamId = tid;
    }

    if (!p1TeamId || !p2TeamId) {
      return {
        error: `Game ${game.gameNumber}: could not match "${parsed.p1Username}" and "${parsed.p2Username}" to the teams in this match. Make sure showdown names are recorded for all players.`,
      };
    }

    const winnerTeamId =
      parsed.winner === "p1" ? p1TeamId :
      parsed.winner === "p2" ? p2TeamId :
      null;

    // Upsert match_games row and retrieve its ID
    const { data: gameRow, error: gameError } = await admin
      .from("match_games")
      .upsert(
        { match_id: matchId, game_number: game.gameNumber, winner_team_id: winnerTeamId, replay_url: replayUrl },
        { onConflict: "match_id,game_number" }
      )
      .select("id")
      .single();

    if (gameError || !gameRow) {
      return { error: `Failed to save game ${game.gameNumber}: ${gameError?.message ?? "unknown error"}` };
    }

    const matchGameId = gameRow.id as number;

    // Clear any existing pokemon data (safe re-submission)
    await admin.from("match_game_pokemon").delete().eq("match_game_id", matchGameId);

    // Look up pokemon IDs for all selected pokemon
    const allNames = [...parsed.p1Selected, ...parsed.p2Selected];
    const slugs = [...new Set(allNames.map(nameToSlug))];

    const { data: pokemonRows } = await admin
      .from("pokemon")
      .select("id, slug")
      .in("slug", slugs);

    const pokemonBySlug = new Map((pokemonRows ?? []).map((p) => [p.slug as string, p.id as number]));

    // Build insert rows for both teams
    const insertRows: { match_game_id: number; team_id: number; pokemon_id: number; kills: number; deaths: number }[] = [];

    const pairs: [number, string[], Record<string, { kills: number; deaths: number }>][] = [
      [p1TeamId, parsed.p1Selected, parsed.p1Stats],
      [p2TeamId, parsed.p2Selected, parsed.p2Stats],
    ];

    for (const [teamId, selected, stats] of pairs) {
      for (const pokemonName of selected) {
        const pokemonId = pokemonBySlug.get(nameToSlug(pokemonName));
        if (!pokemonId) {
          console.warn(`[submitMatchResults] Pokemon not found in DB: "${pokemonName}" (slug: "${nameToSlug(pokemonName)}")`);
          continue;
        }
        const s = stats[pokemonName] ?? { kills: 0, deaths: 0 };
        insertRows.push({ match_game_id: matchGameId, team_id: teamId, pokemon_id: pokemonId, kills: s.kills, deaths: s.deaths });
      }
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await admin.from("match_game_pokemon").insert(insertRows);
      if (insertError) {
        return { error: `Failed to save pokemon data for game ${game.gameNumber}: ${insertError.message}` };
      }
    }
  }

  // Stamp played_at if not already set
  await admin
    .from("matches")
    .update({ played_at: new Date().toISOString() })
    .eq("id", matchId)
    .is("played_at", null);

  revalidatePath("/my-team");
  revalidatePath("/schedules");

  return { error: null };
}
