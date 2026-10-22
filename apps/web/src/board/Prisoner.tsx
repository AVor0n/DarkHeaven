import type { Prisoner } from '@darkheaven/engine';
import { memo } from 'react';
import { PRISONER_LETTERS, PRISONER_NAMES } from '../i18n/ru';

export const PRISONER_COLORS: Record<Prisoner['color'], string> = {
  red: '#d8423a',
  yellow: '#e5c02f',
  green: '#4fa65b',
  blue: '#3e7fd1',
  purple: '#9a5cc9',
};

/** Фишка-свеча узника. */
export const CandleToken = memo(function CandleToken({
  prisoner,
  active,
  size = 1,
}: {
  prisoner: Prisoner;
  active: boolean;
  size?: number;
}) {
  const color = PRISONER_COLORS[prisoner.color];
  return (
    <svg
      viewBox="0 0 40 60"
      className={`candle ${active ? 'candle--active' : ''} ${prisoner.lit ? '' : 'candle--out'}`}
      style={{ width: `${size * 100}%` }}
      role="img"
      aria-label={`${PRISONER_NAMES[prisoner.color]}${prisoner.lit ? '' : ', свеча погашена'}${prisoner.hasKey ? ', с ключом' : ''}`}
    >
      {prisoner.lit ? (
        <g className="candle__flame">
          <ellipse cx={20} cy={14} rx={9} ry={12} fill="#f3c77a" opacity={0.25} />
          <path d="M20 4c5 7 6 11 3 15a4 4 0 0 1-6 0c-3-4-2-8 3-15z" fill="#ffd27a" />
          <path d="M20 10c2 4 2 6 1 8a1.6 1.6 0 0 1-2 0c-1-2-1-4 1-8z" fill="#fff6dc" />
        </g>
      ) : (
        <path
          className="candle__smoke"
          d="M20 18c-3-4 3-6 0-10s3-6 0-8"
          fill="none"
          stroke="#8b8590"
          strokeWidth={1.2}
          opacity={0.7}
        />
      )}
      <path d="M20 19v4" stroke="#1a1414" strokeWidth={1.5} />
      <path
        d="M11 24h18v28a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z"
        fill={color}
        stroke="#0b090d"
        strokeWidth={1.5}
      />
      <path
        d="M13 26q2 4 0 8"
        stroke="#ffffff"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        fill="none"
      />
      <text x={20} y={45} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0b090d">
        {PRISONER_LETTERS[prisoner.color]}
      </text>
      {prisoner.hasKey && (
        <g transform="translate(26 44)">
          <circle r={7} fill="#0b090d" stroke="#f3c77a" strokeWidth={1.2} />
          <circle cx={-2} cy={0} r={2} fill="none" stroke="#f3c77a" strokeWidth={1.2} />
          <path d="M0 0h4M3 0v2" stroke="#f3c77a" strokeWidth={1.2} />
        </g>
      )}
    </svg>
  );
});
