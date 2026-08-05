import PokeballSpinner from "@/components/PokeballSpinner";

export default function Loading() {
  return (
    <main className="pt-20 pb-16 min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <PokeballSpinner className="w-10 h-10" />
        <span className="text-sm">Loading draft pool…</span>
      </div>
    </main>
  );
}
