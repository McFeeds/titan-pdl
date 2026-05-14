"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/pokemon", label: "Pokémon" },
  { href: "/admin/seasons", label: "Seasons" },
  { href: "/admin/rosters", label: "Rosters" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 border-r border-white/10 bg-[#0a0a14] min-h-full">
      <div className="px-4 py-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          Admin Panel
        </p>
        <nav className="flex flex-col gap-1">
          {links.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
