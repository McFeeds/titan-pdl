"use client";

type Props = {
  action: (formData: FormData) => Promise<void>;
  id: number;
  message: string;
  className?: string;
};

export default function ConfirmDeleteButton({ action, id, message, className }: Props) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={className}
        onClick={(e) => {
          if (!confirm(message)) e.preventDefault();
        }}
      >
        Delete
      </button>
    </form>
  );
}
