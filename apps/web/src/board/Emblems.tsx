import type { TileKind } from '@darkheaven/engine';

/**
 * Векторные эмблемы плиток в стиле белой гравюры. Сгенерированные
 * иллюстрации (docs/spec/05-assets.md) накладываются поверх, а эти остаются
 * запасным вариантом и основой силуэта.
 */

const BONE = 'var(--bone)';

function Key() {
  return (
    <g fill="none" stroke={BONE} strokeWidth={2.4} strokeLinecap="round">
      <circle cx={50} cy={50} r={17} fill="#0d0b10" stroke="none" opacity={0.85} />
      <circle cx={39} cy={50} r={6.5} />
      <circle cx={39} cy={50} r={2.2} />
      <path d="M45.5 50H63M57 50v5M61 50v6M63 50l2-2" />
    </g>
  );
}

function Gate() {
  return (
    <g>
      <rect
        x={28}
        y={28}
        width={44}
        height={44}
        rx={3}
        fill="#0d0b10"
        stroke={BONE}
        strokeWidth={2}
      />
      {[
        [28, 28],
        [72, 28],
        [28, 72],
        [72, 72],
      ].map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={5}
          fill="#0d0b10"
          stroke={BONE}
          strokeWidth={1.8}
        />
      ))}
      <path d="M38 64V48a12 12 0 0 1 24 0v16" fill="#000" stroke={BONE} strokeWidth={1.6} />
      <circle cx={45} cy={50} r={2.6} fill={BONE} opacity={0.8} />
      <circle cx={55} cy={50} r={2.6} fill={BONE} opacity={0.8} />
      <path d="M46 58h8" stroke={BONE} strokeWidth={1.2} />
    </g>
  );
}

function Start() {
  return (
    <g fill="none" stroke={BONE}>
      <circle cx={50} cy={50} r={16} fill="#0d0b10" strokeWidth={2} />
      <circle cx={50} cy={50} r={10} strokeWidth={1.2} />
      <circle cx={50} cy={50} r={3} fill={BONE} stroke="none" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <path
            key={a}
            d={`M${50 + Math.cos(a) * 11.5} ${50 + Math.sin(a) * 11.5}L${50 + Math.cos(a) * 14.5} ${50 + Math.sin(a) * 14.5}`}
            strokeWidth={1.2}
          />
        );
      })}
    </g>
  );
}

function WaxEater() {
  const arms = Array.from({ length: 6 }, (_, i) => (i / 6) * 360);
  return (
    <g>
      <circle cx={50} cy={50} r={24} fill="#0b090d" opacity={0.9} />
      {arms.map((deg) => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>
          <path
            d="M50 44C58 38 64 30 62 20M62 20l-4 1M62 20l1-4M62 20l3 3"
            fill="none"
            stroke={BONE}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </g>
      ))}
      <ellipse cx={50} cy={50} rx={8} ry={10} fill="#1a1418" stroke={BONE} strokeWidth={1.6} />
      <path d="M44 48h12M44 52h12M45 56h10" stroke={BONE} strokeWidth={0.9} />
    </g>
  );
}

function KeyKeeper() {
  return (
    <g>
      <circle cx={50} cy={50} r={24} fill="#0b090d" opacity={0.9} />
      {/* Рот смотрит на юг в повороте 0. */}
      <path d="M34 62q16 14 32 0" fill="#000" stroke={BONE} strokeWidth={2} />
      <path d="M38 64l3 4 3-4 3 4 3-4 3 4 3-4 3 4" fill="none" stroke={BONE} strokeWidth={1.2} />
      <path
        d="M30 40c-8-6-10-14-4-18M70 40c8-6 10-14 4-18M40 34c-2-8 2-14 8-14M60 34c2-8-2-14-8-14"
        fill="none"
        stroke={BONE}
        strokeWidth={1.6}
      />
      <circle cx={43} cy={46} r={3} fill={BONE} />
      <circle cx={57} cy={46} r={3} fill={BONE} />
      <path d="M46 54h8" stroke={BONE} strokeWidth={1.4} />
    </g>
  );
}

function DarkSpawn() {
  return (
    <g>
      <circle
        cx={50}
        cy={50}
        r={22}
        fill="#000"
        stroke={BONE}
        strokeWidth={1.2}
        strokeDasharray="2 3"
      />
      <circle cx={50} cy={50} r={15} fill="#050405" />
      <circle cx={50} cy={44} r={2.6} fill="#fff" />
      <circle cx={50} cy={56} r={2.6} fill="#fff" />
    </g>
  );
}

function Herald() {
  return (
    <g>
      <path d="M24 50q26-26 52 0q-26 26-52 0z" fill="#0b090d" stroke={BONE} strokeWidth={2} />
      <circle cx={50} cy={50} r={9} fill="#000" stroke={BONE} strokeWidth={1.4} />
      <circle cx={50} cy={50} r={3.4} fill="var(--wax)" />
    </g>
  );
}

function Inevitable() {
  const spikes = Array.from({ length: 16 }, (_, i) => (i / 16) * 360);
  return (
    <g>
      <circle cx={50} cy={50} r={20} fill="#0b090d" stroke={BONE} strokeWidth={1.6} />
      {spikes.map((deg) => (
        <path key={deg} transform={`rotate(${deg} 50 50)`} d="M50 30l-2-8 2 3 2-3z" fill={BONE} />
      ))}
      <circle cx={50} cy={50} r={6} fill="var(--ember)" />
      <circle cx={50} cy={50} r={2} fill="#000" />
    </g>
  );
}

function LightEater() {
  return (
    <g>
      <circle cx={50} cy={50} r={22} fill="#0b090d" />
      <path d="M32 46q18 22 36 0" fill="#000" stroke={BONE} strokeWidth={2} />
      <path
        d="M35 48l3 6 3-5 3 6 3-6 3 6 3-6 3 6 3-5 3 5"
        fill="none"
        stroke={BONE}
        strokeWidth={1.2}
      />
      <circle cx={40} cy={36} r={3} fill={BONE} />
      <circle cx={50} cy={33} r={3} fill={BONE} />
      <circle cx={60} cy={36} r={3} fill={BONE} />
    </g>
  );
}

function PathBreaker() {
  return (
    <g>
      <ellipse cx={50} cy={50} rx={18} ry={24} fill="#0b090d" stroke={BONE} strokeWidth={1.8} />
      <circle cx={42} cy={38} r={4} fill={BONE} />
      <circle cx={58} cy={38} r={4} fill={BONE} />
      <circle cx={42} cy={62} r={4} fill={BONE} />
      <circle cx={58} cy={62} r={4} fill={BONE} />
      <circle cx={50} cy={50} r={5} fill="none" stroke={BONE} strokeWidth={1.4} />
      <path d="M50 22v-6M50 78v6" stroke="var(--ember)" strokeWidth={2.4} />
    </g>
  );
}

export function Emblem({ kind }: { kind: TileKind }) {
  switch (kind) {
    case 'key':
      return <Key />;
    case 'gate':
      return <Gate />;
    case 'start':
      return <Start />;
    case 'waxEater':
      return <WaxEater />;
    case 'keyKeeper':
      return <KeyKeeper />;
    case 'darkSpawn':
      return <DarkSpawn />;
    case 'herald':
      return <Herald />;
    case 'inevitable':
      return <Inevitable />;
    case 'lightEater':
      return <LightEater />;
    case 'pathBreaker':
      return <PathBreaker />;
    default:
      return null;
  }
}

/** Эмблемы, которые поворачиваются вместе с плиткой (у них есть направление). */
export const DIRECTIONAL: ReadonlySet<TileKind> = new Set(['keyKeeper', 'pathBreaker']);
