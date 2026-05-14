import { createClient } from "@/lib/supabase/server";
import { createSeason, setActiveSeason, deleteSeason } from "./actions";
import SeasonsForm from "./SeasonsForm";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export default async function AdminSeasonsPage() {
  const supabase = await createClient();
  const { data: seasons } = await supabase
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Seasons</h1>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          New Season
        </h2>
        <SeasonsForm action={createSeason} />
      </div>

      {!!seasons?.length && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            All Seasons
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="pb-3 pr-6">Name</th>
                <th className="pb-3 pr-6">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {seasons.map((season) => (
                <tr key={season.id} className="border-t border-white/5">
                  <td className="py-3 pr-6 text-white font-medium">{season.name}</td>
                  <td className="py-3 pr-6">
                    {season.is_active ? (
                      <span className="px-2 py-0.5 bg-green-900/40 border border-green-500/30 text-green-400 text-xs rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Inactive</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-4">
                      {!season.is_active && (
                        <form action={setActiveSeason}>
                          <input type="hidden" name="id" value={season.id} />
                          <button
                            type="submit"
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            Set Active
                          </button>
                        </form>
                      )}
                      <ConfirmDeleteButton
                        action={deleteSeason}
                        id={season.id}
                        message={`Delete season "${season.name}"?`}
                        className="text-xs text-red-400 hover:text-red-300 font-medium"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
