"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { computeOnClockTeamId, GO_TO_DRAFT_POOL_EVENT, type DraftTeamState } from "@/lib/draft";

// Mounted once in the root layout so it's present on every page — tracks
// whether the logged-in user's team is on the clock in an active draft and
// surfaces a banner + browser notification the moment it becomes their turn.
export default function DraftTurnAlert() {
  const [teamId, setTeamId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [conferenceId, setConferenceId] = useState<number | null>(null);

  const [isDraftActive, setIsDraftActive] = useState(false);
  const [teamStates, setTeamStates] = useState<DraftTeamState[]>([]);

  const [dismissed, setDismissed] = useState(false);
  const notifiedRef = useRef(false);
  const pickIdToTeamRef = useRef<Map<number, number>>(new Map());

  // Resolve which team (if any) the current user belongs to this season.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function resolve() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const discordUsername =
        (user.user_metadata?.user_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined);
      if (!discordUsername) return;

      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!activeSeason || cancelled) return;

      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .ilike("discord_id", discordUsername)
        .eq("season_id", activeSeason.id)
        .limit(1)
        .maybeSingle();
      if (!membership || cancelled) return;

      const { data: placement } = await supabase
        .from("team_seasons")
        .select("conference_id")
        .eq("team_id", membership.team_id)
        .eq("season_id", activeSeason.id)
        .maybeSingle();
      if (!placement || cancelled) return;

      setSeasonId(activeSeason.id);
      setTeamId(membership.team_id);
      setConferenceId(placement.conference_id);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load current draft state for that conference and keep it live.
  useEffect(() => {
    if (seasonId === null || conferenceId === null) return;
    const supabase = createClient();
    let cancelled = false;

    async function loadInitial() {
      const [{ data: draftState }, { data: draftLog }, { data: conferenceTeamSeasons }] =
        await Promise.all([
          supabase
            .from("conference_drafts")
            .select("is_active")
            .eq("season_id", seasonId)
            .eq("conference_id", conferenceId)
            .maybeSingle(),
          supabase
            .from("draft_log")
            .select("id, team_id")
            .eq("season_id", seasonId)
            .eq("conference_id", conferenceId),
          supabase
            .from("team_seasons")
            .select("team_id, draft_position, draft_ended_at")
            .eq("season_id", seasonId)
            .eq("conference_id", conferenceId),
        ]);
      if (cancelled) return;

      const picksMadeByTeam = new Map<number, number>();
      for (const row of draftLog ?? []) {
        picksMadeByTeam.set(row.team_id, (picksMadeByTeam.get(row.team_id) ?? 0) + 1);
        pickIdToTeamRef.current.set(row.id, row.team_id);
      }

      setIsDraftActive(draftState?.is_active ?? false);
      setTeamStates(
        (conferenceTeamSeasons ?? []).map((ts) => ({
          id: ts.team_id,
          draftPosition: ts.draft_position,
          draftEnded: ts.draft_ended_at !== null,
          picksMade: picksMadeByTeam.get(ts.team_id) ?? 0,
        }))
      );
    }

    loadInitial();

    const channel = supabase
      .channel(`draft-turn-alert-${seasonId}-${conferenceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_log" },
        (payload) => {
          const row = payload.new as {
            id: number;
            season_id: number;
            conference_id: number;
            team_id: number;
          };
          if (row.season_id !== seasonId || row.conference_id !== conferenceId) return;
          pickIdToTeamRef.current.set(row.id, row.team_id);
          setTeamStates((prev) =>
            prev.map((t) => (t.id === row.team_id ? { ...t, picksMade: t.picksMade + 1 } : t))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "draft_log" },
        (payload) => {
          const row = payload.old as { id: number };
          const pickTeamId = pickIdToTeamRef.current.get(row.id);
          if (pickTeamId === undefined) return;
          pickIdToTeamRef.current.delete(row.id);
          setTeamStates((prev) =>
            prev.map((t) => (t.id === pickTeamId ? { ...t, picksMade: Math.max(0, t.picksMade - 1) } : t))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conference_drafts" },
        (payload) => {
          const row = payload.new as { season_id: number; conference_id: number; is_active: boolean };
          if (row.season_id !== seasonId || row.conference_id !== conferenceId) return;
          setIsDraftActive(row.is_active);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conference_drafts" },
        (payload) => {
          const row = payload.new as { season_id: number; conference_id: number; is_active: boolean };
          if (row.season_id !== seasonId || row.conference_id !== conferenceId) return;
          setIsDraftActive(row.is_active);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_seasons" },
        (payload) => {
          const row = payload.new as {
            team_id: number;
            season_id: number;
            conference_id: number;
            draft_ended_at: string | null;
          };
          if (row.season_id !== seasonId || row.conference_id !== conferenceId) return;
          setTeamStates((prev) =>
            prev.map((t) => (t.id === row.team_id ? { ...t, draftEnded: row.draft_ended_at !== null } : t))
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [seasonId, conferenceId]);

  const onClockTeamId = useMemo(() => {
    if (!isDraftActive || teamStates.length === 0) return null;
    return computeOnClockTeamId(teamStates);
  }, [isDraftActive, teamStates]);

  const isMyTurn = teamId !== null && onClockTeamId === teamId;

  // Fire a browser notification exactly once per "your turn" event, and
  // clear any earlier dismissal so the banner reappears for the new turn.
  useEffect(() => {
    if (isMyTurn) {
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        setDismissed(false);
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification("It's your turn to pick!", {
            body: "Head to the Draft Pools to make your pick.",
          });
        }
      }
    } else {
      notifiedRef.current = false;
    }
  }, [isMyTurn]);

  // Ask for notification permission as soon as we know a draft is live for
  // our conference, so it's already resolved by the time our turn comes up.
  useEffect(() => {
    if (
      isDraftActive &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, [isDraftActive]);

  if (!isMyTurn || dismissed) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-emerald-600 text-white pl-4 pr-2 py-3 rounded-xl shadow-2xl shadow-emerald-900/50 border border-emerald-400/40">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-bold whitespace-nowrap">It&apos;s your turn to pick!</span>
      <Link
        href="/draft-pools"
        onClick={() => window.dispatchEvent(new Event(GO_TO_DRAFT_POOL_EVENT))}
        className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        Go to Draft
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/70 hover:text-white text-sm font-bold px-2"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
