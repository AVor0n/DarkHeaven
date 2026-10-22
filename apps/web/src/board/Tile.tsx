import { type Rot, TILE_KINDS, type TileKind } from '@darkheaven/engine';
import { memo } from 'react';
import { DIRECTIONAL, Emblem } from './Emblems';
import { pitRim, tileGeometry } from './tileArt';

/** Общие градиенты и текстуры для всех плиток; рендерится один раз на страницу. */
export function SvgDefs() {
  const dots = Array.from({ length: 60 }, (_, i) => {
    const x = (i * 37) % 50;
    const y = (i * 53 + (i % 7) * 11) % 50;
    const r = 0.35 + ((i * 13) % 5) * 0.12;
    // biome-ignore lint/suspicious/noArrayIndexKey: статичный узор
    return <circle key={i} cx={x} cy={y} r={r} />;
  });
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <radialGradient id="dh-stone-grad" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#1f1a22" />
          <stop offset="100%" stopColor="#0c0a0e" />
        </radialGradient>
        <pattern id="dh-stone-noise" width={50} height={50} patternUnits="userSpaceOnUse">
          <g fill="#3a3238" opacity={0.55}>
            {dots}
          </g>
        </pattern>
        <linearGradient id="dh-passage" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2e8d5" />
          <stop offset="55%" stopColor="#d8c8ad" />
          <stop offset="100%" stopColor="#c2ad8f" />
        </linearGradient>
        <pattern id="dh-grain" width={50} height={50} patternUnits="userSpaceOnUse">
          <g fill="#6a5a50" opacity={0.6}>
            {dots}
          </g>
        </pattern>
        <radialGradient id="dh-hole" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" />
          <stop offset="70%" stopColor="#050306" />
          <stop offset="100%" stopColor="#2a1c1a" />
        </radialGradient>
      </defs>
    </svg>
  );
}

interface TileProps {
  kind: TileKind;
  rot: Rot;
  pit: boolean;
  /** Id физической плитки — зерно для неровностей. */
  seed: number;
  keyTaken?: boolean;
}

function Stone() {
  return (
    <>
      <rect width={100} height={100} fill="url(#dh-stone-grad)" />
      <rect width={100} height={100} fill="url(#dh-stone-noise)" />
    </>
  );
}

function Pit({ seed }: { seed: number }) {
  const geo = tileGeometry(15, seed, false);
  return (
    <>
      <Stone />
      <path d={geo.passage} fill="#3b2e2a" opacity={0.65} />
      <path d={pitRim(seed)} fill="url(#dh-hole)" stroke="#c9b597" strokeWidth={1.4} />
      <path
        d={pitRim(seed + 1)}
        fill="none"
        stroke="#c9b597"
        strokeWidth={0.6}
        opacity={0.5}
        transform="translate(50 50) scale(0.72) translate(-50 -50)"
      />
    </>
  );
}

export const TileSvg = memo(function TileSvg({ kind, rot, pit, seed, keyTaken }: TileProps) {
  if (pit) {
    return (
      <svg viewBox="0 0 100 100" className="tile-svg" aria-hidden="true">
        <Pit seed={seed} />
      </svg>
    );
  }
  const def = TILE_KINDS[kind];
  const geo = tileGeometry(def.exits, seed, def.crumbling);
  const directional = DIRECTIONAL.has(kind);
  const dimEmblem = kind === 'key' && keyTaken;
  return (
    <svg viewBox="0 0 100 100" className="tile-svg" aria-hidden="true">
      <Stone />
      <path d={geo.scratches} fill="none" stroke="#cdbfa8" strokeWidth={0.5} opacity={0.3} />
      <g transform={`rotate(${rot * 90} 50 50)`}>
        <path d={geo.passage} fill="none" stroke="#f3e6cc" strokeWidth={5} opacity={0.12} />
        <path d={geo.passage} fill="url(#dh-passage)" />
        <path d={geo.passage} fill="url(#dh-grain)" opacity={0.45} />
        {geo.cracks && (
          <path
            d={geo.cracks}
            fill="none"
            stroke="#241a1a"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        )}
        {directional && <Emblem kind={kind} />}
      </g>
      {!directional && (
        <g opacity={dimEmblem ? 0.25 : 1}>
          <Emblem kind={kind} />
        </g>
      )}
    </svg>
  );
});
