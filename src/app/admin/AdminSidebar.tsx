"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/pokemon", label: "Pokémon" },
  { href: "/admin/seasons", label: "Seasons" },
  { href: "/admin/rosters", label: "Rosters" },
  { href: "/admin/draft-pools", label: "Draft Pools" },
  { href: "/admin/matches", label: "Matches" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-48 md:shrink-0 border-b md:border-b-0 md:border-r border-white/10 bg-[#0a0a14] md:min-h-full">
      <div className="px-4 py-3 md:py-5">
        <p className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          Admin Panel
        </p>
        <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto">
          {links.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
