import Link from "next/link";

export default function UnderConstruction({ title }: { title: string }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center pt-16">
      <div className="text-red-500/80">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-20 h-20"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-white">{title}</h1>
        <p className="text-gray-400 text-lg">This page is under construction. Check back soon!</p>
      </div>

      <Link
        href="/"
        className="mt-2 px-8 py-3 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-semibold rounded-lg transition-colors"
      >
        Back to Home
      </Link>
    </main>
  );
}
