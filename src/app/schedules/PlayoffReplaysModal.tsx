"use client";

export default function PlayoffReplaysModal({
  replayUrls,
  onClose,
}: {
  replayUrls: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 shrink-0">
          <h2 className="text-base font-bold text-white">Replays</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition-colors ml-4 mt-0.5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 flex flex-col gap-2">
          {replayUrls.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No replays were submitted for this match.</p>
          ) : (
            replayUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2.5 transition-colors"
              >
                <span className="font-semibold">Game {i + 1}</span>
                <span className="text-indigo-400">Watch replay →</span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
