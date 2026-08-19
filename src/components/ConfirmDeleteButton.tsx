"use client";

import { useActionState } from "react";

type State = { error?: string } | null;

type Props = {
  action: (prevState: State, formData: FormData) => Promise<State>;
  id: number;
  message: string;
  className?: string;
};

export default function ConfirmDeleteButton({ action, id, message, className }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className={`${className ?? ""} disabled:opacity-50`}
        onClick={(e) => {
          if (!confirm(message)) e.preventDefault();
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state?.error && <span className="text-red-400 text-xs">{state.error}</span>}
    </form>
  );
}
