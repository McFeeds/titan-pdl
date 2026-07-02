"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getDiscordUsername } from "@/lib/supabase/admin";
import { parseShowdownLog, nameToSlug } from "@/lib/showdown-log-parser";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------- Exported types for the confirmation UI ----------

export interface PokemonGameStat {
  name: string;
  kills: number;
  deaths: number;
}

export interface TeamGameData {
  teamName: string;
  isMyTeam: boolean;
  pokemon: PokemonGameStat[];
}

export interface GameAnalysis {
  gameNumber: number;
  replayUrl: string;
  winnerTeamName: string | null;
  teams: [TeamGameData, TeamGameData]; // [p1-side team, p2-side team]
}

export interface MatchAnalysis {
  games: GameAnalysis[];
}

// ---------- Shared helpers ----------

interface MatchSetup {
  match: { id: number; home_team_id: number; away_team_id: number; season_id: number };
  myTeamId: number;
  teamNames: Map<number, string>;
  membersByTeam: Record<number, string[]>;
  admin: SupabaseClient;
}

async function resolveMatchSetup(
  matchId: number,
  discordUsername: string
): Promise<{ setup: MatchSetup | null; error: string | null }> {
  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("id, home_team_id, away_team_id, season_id")
    .eq("id", matchId)
    .single();

  if (!match) return { setup: null, error: "Match not found" };

  // Verify the caller belongs to one of the two teams
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", match.season_id)
    .in("team_id", [match.home_team_id, match.away_team_id])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { setup: null, error: "You are not a member of either team in this match" };
  }

  // Fetch team names and showdown usernames in parallel
  const [{ data: teams }, { data: teamMembers }] = await Promise.all([
    admin
      .from("teams")
      .select("id, team_name")
      .in("id", [match.home_team_id, match.away_team_id]),
    admin
      .from("team_members")
      .select("team_id, showdown_name")
      .in("team_id", [match.home_team_id, match.away_team_id])
      .eq("season_id", match.season_id)
      .not("showdown_name", "is", null),
  ]);

  const teamNames = new Map((teams ?? []).map((t) => [t.id as number, t.team_name as string]));

  const membersByTeam: Record<number, string[]> = {};
  for (const tm of teamMembers ?? []) {
    if (!tm.showdown_name) continue;
    const tid = tm.team_id as number;
    if (!membersByTeam[tid]) membersByTeam[tid] = [];
    membersByTeam[tid].push((tm.showdown_name as string).toLowerCase());
  }

  return {
    setup: {
      match: match as MatchSetup["match"],
      myTeamId: membership.team_id as number,
      teamNames,
      membersByTeam,
      admin,
    },
    error: null,
  };
}

async function fetchAndParseLog(
  replayUrl: string,
  gameNumber: number
): Promise<{ logText: string | null; error: string | null }> {
  const normalized = replayUrl.startsWith("http") ? replayUrl : `https://${replayUrl}`;
  const logUrl = normalized.endsWith(".log") ? normalized : `${normalized}.log`;
  try {
    const res = await fetch(logUrl, { cache: "no-store" });
    if (!res.ok) {
      return { logText: null, error: `Could not fetch replay for game ${gameNumber} (HTTP ${res.status}). Check the URL and try again.` };
    }
    return { logText: await res.text(), error: null };
  } catch {
    return { logText: null, error: `Failed to load replay for game ${gameNumber}. Check the URL and your connection.` };
  }
}

// ---------- Public actions ----------

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

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", seasonId)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "Not on a team this season" };

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

// Fetch and parse replays, return a preview for user confirmation — no DB writes.
export async function analyzeMatchResults(
  matchId: number,
  games: { gameNumber: number; replayUrl: string }[]
): Promise<{ analysis: MatchAnalysis | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { analysis: null, error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { analysis: null, error: "Not authenticated" };

  const { setup, error: setupError } = await resolveMatchSetup(matchId, discordUsername);
  if (!setup) return { analysis: null, error: setupError };

  const { myTeamId, teamNames, membersByTeam } = setup;

  const gameAnalyses: GameAnalysis[] = [];

  for (const game of games) {
    const rawUrl = game.replayUrl.trim();
    if (!rawUrl) continue;

    const replayUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const { logText, error: fetchError } = await fetchAndParseLog(rawUrl, game.gameNumber);
    if (!logText) return { analysis: null, error: fetchError };

    const parsed = parseShowdownLog(logText);

    let p1TeamId: number | null = null;
    let p2TeamId: number | null = null;
    for (const [tidStr, names] of Object.entries(membersByTeam)) {
      const tid = Number(tidStr);
      if (names.includes(parsed.p1Username.toLowerCase())) p1TeamId = tid;
      if (names.includes(parsed.p2Username.toLowerCase())) p2TeamId = tid;
    }

    if (!p1TeamId || !p2TeamId) {
      return {
        analysis: null,
        error: `Game ${game.gameNumber}: could not match "${parsed.p1Username}" and "${parsed.p2Username}" to the teams in this match. Make sure showdown names are recorded for all players.`,
      };
    }

    const winnerTeamId =
      parsed.winner === "p1" ? p1TeamId :
      parsed.winner === "p2" ? p2TeamId :
      null;

    const buildTeamData = (
      teamId: number,
      selected: string[],
      stats: Record<string, { kills: number; deaths: number }>
    ): TeamGameData => ({
      teamName: teamNames.get(teamId) ?? "Unknown",
      isMyTeam: teamId === myTeamId,
      pokemon: selected.map((name) => {
        const s = stats[name] ?? { kills: 0, deaths: 0 };
        return { name, kills: s.kills, deaths: s.deaths };
      }),
    });

    gameAnalyses.push({
      gameNumber: game.gameNumber,
      replayUrl,
      winnerTeamName: winnerTeamId ? (teamNames.get(winnerTeamId) ?? null) : null,
      teams: [
        buildTeamData(p1TeamId, parsed.p1Selected, parsed.p1Stats),
        buildTeamData(p2TeamId, parsed.p2Selected, parsed.p2Stats),
      ],
    });
  }

  return { analysis: { games: gameAnalyses }, error: null };
}

// Write confirmed results to the database.
export async function submitMatchResults(
  matchId: number,
  games: { gameNumber: number; replayUrl: string }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) return { error: "Not authenticated" };

  const { setup, error: setupError } = await resolveMatchSetup(matchId, discordUsername);
  if (!setup) return { error: setupError };

  const { match, membersByTeam, admin } = setup;

  // Guard: don't overwrite existing game data
  const { data: existingGames } = await admin
    .from("match_games")
    .select("id")
    .eq("match_id", matchId)
    .limit(1);

  if (existingGames && existingGames.length > 0) {
    return { error: "Results already exist for this match. Contact an admin to make changes." };
  }

  for (const game of games) {
    const rawUrl = game.replayUrl.trim();
    if (!rawUrl) continue;

    const replayUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const { logText, error: fetchError } = await fetchAndParseLog(rawUrl, game.gameNumber);
    if (!logText) return { error: fetchError };

    const parsed = parseShowdownLog(logText);

    let p1TeamId: number | null = null;
    let p2TeamId: number | null = null;
    for (const [tidStr, names] of Object.entries(membersByTeam)) {
      const tid = Number(tidStr);
      if (names.includes(parsed.p1Username.toLowerCase())) p1TeamId = tid;
      if (names.includes(parsed.p2Username.toLowerCase())) p2TeamId = tid;
    }

    if (!p1TeamId || !p2TeamId) {
      return {
        error: `Game ${game.gameNumber}: could not match "${parsed.p1Username}" and "${parsed.p2Username}" to the teams in this match.`,
      };
    }

    const winnerTeamId =
      parsed.winner === "p1" ? p1TeamId :
      parsed.winner === "p2" ? p2TeamId :
      null;

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

    await admin.from("match_game_pokemon").delete().eq("match_game_id", matchGameId);

    const allNames = [...parsed.p1Selected, ...parsed.p2Selected];
    const slugs = [...new Set(allNames.map(nameToSlug))];

    const { data: pokemonRows } = await admin
      .from("pokemon")
      .select("id, slug")
      .in("slug", slugs);

    const pokemonBySlug = new Map((pokemonRows ?? []).map((p) => [p.slug as string, p.id as number]));

    const insertRows: { match_game_id: number; team_id: number; pokemon_id: number; kills: number; deaths: number }[] = [];

    const pairs: [number, string[], Record<string, { kills: number; deaths: number }>][] = [
      [p1TeamId, parsed.p1Selected, parsed.p1Stats],
      [p2TeamId, parsed.p2Selected, parsed.p2Stats],
    ];

    for (const [teamId, selected, stats] of pairs) {
      for (const pokemonName of selected) {
        const pokemonId = pokemonBySlug.get(nameToSlug(pokemonName));
        if (!pokemonId) {
          console.warn(`[submitMatchResults] Pokemon not found in DB: "${pokemonName}"`);
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

  await admin
    .from("matches")
    .update({ played_at: new Date().toISOString() })
    .eq("id", match.id)
    .is("played_at", null);

  revalidatePath("/my-team");
  revalidatePath("/schedules");

  return { error: null };
}
