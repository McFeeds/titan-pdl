"use client";

import { useActionState } from "react";

type State = { error?: string } | null;

export default function SeasonsForm({
  action,
}: {
  action: (prevState: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-start gap-3">
      <div className="flex flex-col gap-1">
        <input
          name="name"
          placeholder="Season 1"
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
        />
        {state?.error && (
          <p className="text-red-400 text-xs">{state.error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
