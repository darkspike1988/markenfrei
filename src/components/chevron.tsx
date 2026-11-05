/** Kleiner Pfeil für aufklappbare Zeilen; dreht sich über CSS, wenn das umgebende <details> offen ist. */
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`chevron shrink-0 ${className}`}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
