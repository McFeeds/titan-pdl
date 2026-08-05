export default function PokeballSpinner({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`animate-spin ${className}`}>
      <path d="M 5 50 A 45 45 0 0 1 95 50 Z" fill="#EF4444" />
      <path d="M 5 50 A 45 45 0 0 0 95 50 Z" fill="#F9FAFB" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="#111827" strokeWidth="4" />
      <line x1="5" y1="50" x2="36" y2="50" stroke="#111827" strokeWidth="4" />
      <line x1="64" y1="50" x2="95" y2="50" stroke="#111827" strokeWidth="4" />
      <circle cx="50" cy="50" r="14" fill="#F9FAFB" stroke="#111827" strokeWidth="4" />
      <circle cx="50" cy="50" r="6" fill="#111827" />
    </svg>
  );
}
