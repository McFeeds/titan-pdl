import PokeballSpinner from "@/components/PokeballSpinner";

export default function Loading() {
  return (
    <main className="h-screen pt-20 flex items-center justify-center bg-[#0a0a1a]">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <PokeballSpinner className="w-10 h-10" />
        <span className="text-sm">Loading draft planner…</span>
      </div>
    </main>
  );
}
