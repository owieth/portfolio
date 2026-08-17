'use client';

interface ZieuhilfProps {
  /** Dart origin in container pixels. */
  vo: { x: number; y: number };
  /** Current pointer position, for the taut band. */
  zeiger: { x: number; y: number };
  /** Predicted landing pixel. */
  ziel: { x: number; y: number };
  chraft: number;
  gnue: boolean;
  /** 1σ of the expected miss. */
  sigma: number;
}

/**
 * Live aim preview while dragging: the taut band back to the pointer, the
 * flight path, and a crosshair on the predicted landing point. Renders exactly
 * what `vorschau()` computed, so what you see is where the dart goes (before
 * scatter).
 */
export default function Zieuhilf({
  vo,
  zeiger,
  ziel,
  chraft,
  gnue,
  sigma,
}: ZieuhilfProps) {
  if (!gnue) return null;

  const rot = '#dc2626';

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-(--z-steuerig) size-full"
      aria-hidden="true"
    >
      {/* Honest about the odds: roughly two thirds of throws land inside this
          ring, and it grows with force. Nobody here can actually aim. */}
      <circle
        cx={ziel.x}
        cy={ziel.y}
        r={sigma}
        fill={rot}
        fillOpacity={0.07}
        stroke={rot}
        strokeWidth={1.5}
        strokeOpacity={0.35}
        strokeDasharray="4 7"
      />
      {/* The band being pulled: from the dart back to the cursor. */}
      <line
        x1={vo.x}
        y1={vo.y}
        x2={zeiger.x}
        y2={zeiger.y}
        stroke={rot}
        strokeWidth={2}
        strokeOpacity={0.45}
        strokeDasharray="2 5"
      />

      {/* Where it will fly. */}
      <line
        x1={vo.x}
        y1={vo.y}
        x2={ziel.x}
        y2={ziel.y}
        stroke={rot}
        strokeWidth={2.5}
        strokeDasharray="7 6"
        strokeLinecap="round"
      />

      <g>
        <circle
          cx={ziel.x}
          cy={ziel.y}
          r={16}
          fill="none"
          stroke="#ffffff"
          strokeWidth={4}
          strokeOpacity={0.75}
        />
        <circle
          cx={ziel.x}
          cy={ziel.y}
          r={16}
          fill="none"
          stroke={rot}
          strokeWidth={2}
        />
        <circle cx={ziel.x} cy={ziel.y} r={2.5} fill={rot} />
        <line
          x1={ziel.x - 23}
          y1={ziel.y}
          x2={ziel.x - 8}
          y2={ziel.y}
          stroke={rot}
          strokeWidth={2}
        />
        <line
          x1={ziel.x + 8}
          y1={ziel.y}
          x2={ziel.x + 23}
          y2={ziel.y}
          stroke={rot}
          strokeWidth={2}
        />
        <line
          x1={ziel.x}
          y1={ziel.y - 23}
          x2={ziel.x}
          y2={ziel.y - 8}
          stroke={rot}
          strokeWidth={2}
        />
        <line
          x1={ziel.x}
          y1={ziel.y + 8}
          x2={ziel.x}
          y2={ziel.y + 23}
          stroke={rot}
          strokeWidth={2}
        />
      </g>

      {/* Force, drawn as an arc filling around the crosshair. */}
      <circle
        cx={ziel.x}
        cy={ziel.y}
        r={26}
        fill="none"
        stroke={rot}
        strokeWidth={3}
        strokeOpacity={0.9}
        strokeLinecap="round"
        strokeDasharray={`${chraft * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
        transform={`rotate(-90 ${ziel.x} ${ziel.y})`}
      />
    </svg>
  );
}
