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
  const [draftPoolId, setDraftPoolId] = useState<number | null>(null);

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
        .select("draft_pool_id")
        .eq("team_id", membership.team_id)
        .eq("season_id", activeSeason.id)
        .maybeSingle();
      if (!placement || cancelled) return;

      setSeasonId(activeSeason.id);
      setTeamId(membership.team_id);
      setDraftPoolId(placement.draft_pool_id);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load current draft state for that pool and keep it live.
  useEffect(() => {
    if (seasonId === null || draftPoolId === null) return;
    const supabase = createClient();
    let cancelled = false;

    async function loadInitial() {
      const [{ data: draftPool }, { data: draftLog }, { data: poolTeamSeasons }] =
        await Promise.all([
          supabase
            .from("draft_pools")
            .select("is_active")
            .eq("id", draftPoolId)
            .maybeSingle(),
          supabase
            .from("draft_log")
            .select("id, team_id")
            .eq("draft_pool_id", draftPoolId),
          supabase
            .from("team_seasons")
            .select("team_id, draft_position, draft_ended_at")
            .eq("draft_pool_id", draftPoolId),
        ]);
      if (cancelled) return;

      const picksMadeByTeam = new Map<number, number>();
      for (const row of draftLog ?? []) {
        picksMadeByTeam.set(row.team_id, (picksMadeByTeam.get(row.team_id) ?? 0) + 1);
        pickIdToTeamRef.current.set(row.id, row.team_id);
      }

      setIsDraftActive(draftPool?.is_active ?? false);
      setTeamStates(
        (poolTeamSeasons ?? []).map((ts) => ({
          id: ts.team_id,
          draftPosition: ts.draft_position,
          draftEnded: ts.draft_ended_at !== null,
          picksMade: picksMadeByTeam.get(ts.team_id) ?? 0,
        }))
      );
    }

    loadInitial();

    const channel = supabase
      .channel(`draft-turn-alert-${seasonId}-${draftPoolId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_log" },
        (payload) => {
          const row = payload.new as {
            id: number;
            draft_pool_id: number;
            team_id: number;
          };
          if (row.draft_pool_id !== draftPoolId) return;
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
        { event: "INSERT", schema: "public", table: "draft_pools" },
        (payload) => {
          const row = payload.new as { id: number; is_active: boolean };
          if (row.id !== draftPoolId) return;
          setIsDraftActive(row.is_active);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "draft_pools" },
        (payload) => {
          const row = payload.new as { id: number; is_active: boolean };
          if (row.id !== draftPoolId) return;
          setIsDraftActive(row.is_active);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_seasons" },
        (payload) => {
          const row = payload.new as {
            team_id: number;
            draft_pool_id: number | null;
            draft_ended_at: string | null;
          };
          if (row.draft_pool_id !== draftPoolId) return;
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
  }, [seasonId, draftPoolId]);

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
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-2 w-[calc(100%-2rem)] sm:w-auto max-w-md bg-emerald-600 text-white pl-4 pr-2 py-3 rounded-xl shadow-2xl shadow-emerald-900/50 border border-emerald-400/40">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-bold">It&apos;s your turn to pick!</span>
      <Link
        href="/draft-pools"
        onClick={() => window.dispatchEvent(new Event(GO_TO_DRAFT_POOL_EVENT))}
        className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        Go to Draft
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/70 hover:text-white text-sm font-bold px-2 shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
