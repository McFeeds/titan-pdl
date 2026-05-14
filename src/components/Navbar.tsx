"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/draft-pools", label: "Draft Pools" },
  { href: "/standings", label: "Standings" },
  { href: "/league-rules", label: "League Rules" },
  { href: "/hall-of-fame", label: "Hall of Fame" },
];

const DISCORD_SVG = (
  <svg
    viewBox="0 0 24 24"
    className="w-4 h-4 fill-current shrink-0"
    aria-hidden="true"
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.02.01.04.028.05a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

type Team = {
  team_name: string;
  logo_url: string | null;
};

export default function Navbar() {
  const pathname = usePathname();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadTeam() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const discordUsername =
        (session.user.user_metadata?.user_name as string | undefined) ||
        (session.user.user_metadata?.full_name as string | undefined);

      if (!discordUsername) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("teams")
        .select("team_name, logo_url")
        .ilike("discord_id", discordUsername)
        .single();

      setTeam(data ?? null);
      setLoading(false);
    }

    loadTeam();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      loadTeam();
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleLogin() {
    const supabase = createClient();
    supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0d0d1f]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-16 gap-1">
        <Link
          href="/"
          className="text-white font-bold text-lg mr-6 tracking-wide shrink-0"
        >
          Titan PDL
        </Link>

        <div className="flex items-center gap-1 flex-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "text-white bg-white/10"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {loading ? (
          <div className="w-36 h-9 rounded-lg bg-white/5 animate-pulse shrink-0" />
        ) : team ? (
          <Link
            href="/my-team"
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-sm font-semibold pl-1 pr-3 py-1 rounded-lg transition-colors shrink-0 max-w-[180px]"
          >
            {team.logo_url ? (
              <Image
                src={team.logo_url}
                alt=""
                width={48}
                height={48}
                className="rounded-md shrink-0 object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-md bg-indigo-600 shrink-0 flex items-center justify-center text-base font-bold">
                {team.team_name[0].toUpperCase()}
              </div>
            )}
            <span className="truncate">{team.team_name}</span>
          </Link>
        ) : (
          <button
            onClick={handleLogin}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {DISCORD_SVG}
            Login with Discord
          </button>
        )}
      </div>
    </nav>
  );
}
