import Link from "next/link";

export default async function TeamNotFoundPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const { username } = await searchParams;

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center pt-16">
      <div className="text-yellow-500/80">
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
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-3 max-w-md">
        <h1 className="text-4xl font-bold text-white">Team Not Found</h1>
        {username ? (
          <p className="text-gray-400 text-lg">
            No team was found for Discord user{" "}
            <span className="text-white font-semibold">@{username}</span>.
            Please reach out to a PDL admin to get your team set up.
          </p>
        ) : (
          <p className="text-gray-400 text-lg">
            No team was found for your Discord account. Please reach out to a
            PDL admin to get your team set up.
          </p>
        )}
      </div>

      <Link
        href="/"
        className="mt-2 px-8 py-3 bg-indigo-700 hover:bg-indigo-600 active:bg-indigo-800 text-white font-semibold rounded-lg transition-colors"
      >
        Back to Home
      </Link>
    </main>
  );
}
