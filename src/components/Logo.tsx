import { useId } from "react";

/**
 * Vespera brand mark — an "evening star" (Vespera = Latin for the evening star)
 * rendered as a play triangle with a 4-point sparkle, on the aurora-gradient
 * glass tile. Self-contained SVG; reads cleanly down to ~18px on dark.
 */
export function VesperaMark({ size = 30, className }: { size?: number; className?: string }) {
  const id = useId();
  const grad = `vespera-aurora-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vespera"
      className={className}
    >
      <defs>
        <linearGradient id={grad} x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8cff" />
          <stop offset="0.55" stopColor="#c26bff" />
          <stop offset="1" stopColor="#ff5c8a" />
        </linearGradient>
      </defs>

      {/* aurora glass tile */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill={`url(#${grad})`} />

      {/* play triangle (cinema) */}
      <path
        d="M11.8 10 L20.8 16 L11.8 22 Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />

      {/* evening-star sparkle */}
      <path
        d="M24 4.6 Q24.5 7.5 27 8 Q24.5 8.5 24 11.4 Q23.5 8.5 21 8 Q23.5 7.5 24 4.6 Z"
        fill="#ffffff"
      />
    </svg>
  );
}
