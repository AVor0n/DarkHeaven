import {
  type Cell,
  type GameEvent,
  type GameState,
  keysAvailable,
  setupPlan,
  type TileKind,
} from '@darkheaven/engine';
import { useEffect, useMemo, useRef } from 'react';
import { formatEvent, plural } from '../i18n/ru';

const GROUPS: { label: string; kinds: TileKind[] }[] = [
  { label: 'Ключи', kinds: ['key'] },
  { label: 'Врата', kinds: ['gate'] },
  {
    label: 'Монстры',
    kinds: [
      'waxEater',
      'keyKeeper',
      'darkSpawn',
      'herald',
      'inevitable',
      'lightEater',
      'pathBreaker',
    ],
  },
  { label: 'Проходы', kinds: ['start', 'straight', 't', 'crumblingT', 'cross'] },
];

function eventCells(e: GameEvent): Cell[] {
  switch (e.type) {
    case 'moved':
      return [e.from, e.to];
    case 'attack':
      return [e.monsterCell, ...e.area];
    case 'tileDiscarded':
    case 'crumbled':
    case 'pitOpened':
    case 'landed':
    case 'keyTaken':
    case 'fell':
      return [e.cell];
    case 'hit':
      return [e.monsterCell];
    default:
      return [];
  }
}

/** Свеча-запас: высота воска пропорциональна оставшимся плиткам. */
export function PileCandle({ view }: { view: GameState }) {
  const total = useMemo(() => {
    const plan = setupPlan(view.config);
    const sum = (r: Partial<Record<TileKind, number>>) =>
      Object.values(r).reduce((a, b) => a + (b ?? 0), 0);
    return sum(plan.pile) + sum(plan.initial);
  }, [view.config]);
  const left = view.pile.length;
  const h = Math.max(0.04, left / Math.max(1, total));
  const waxTop = 70 - 56 * h;
  return (
    <div className={`pile ${view.lastFlicker ? 'pile--flicker' : ''}`} title="Запас плиток — свеча">
      <svg viewBox="0 0 40 80" className="pile__svg" aria-hidden="true">
        {left > 0 || !view.lastFlicker ? (
          <g className="candle__flame" style={{ transformOrigin: `20px ${waxTop}px` }}>
            <ellipse cx={20} cy={waxTop - 8} rx={8} ry={11} fill="#f3c77a" opacity={0.22} />
            <path
              d={`M20 ${waxTop - 18}c4 6 5 9 2.5 12.5a3.5 3.5 0 0 1-5 0c-2.5-3.5-1.5-6.5 2.5-12.5z`}
              fill="#ffd27a"
            />
          </g>
        ) : null}
        <path d={`M20 ${waxTop - 5}v5`} stroke="#1a1414" strokeWidth={1.4} />
        <path
          d={`M11 ${waxTop}q4 -2 9 0t9 0v${74 - waxTop}H11z`}
          fill="#e9e0cf"
          stroke="#0b090d"
          strokeWidth={1.2}
        />
        <path
          d={`M13 ${waxTop + 2}q2 3 0 7`}
          stroke="#fff"
          strokeOpacity={0.5}
          strokeWidth={1.2}
          fill="none"
        />
        <rect x={6} y={74} width={28} height={4} rx={1.5} fill="#5a4a3c" />
      </svg>
      <div className="pile__count">
        <strong>{left}</strong>
        <span>{plural(left, 'плитка', 'плитки', 'плиток')} в запасе</span>
        {view.lastFlicker && <em>последнее мерцание</em>}
      </div>
    </div>
  );
}

export function DiscardSummary({ view }: { view: GameState }) {
  const counts = GROUPS.map((g) => ({
    label: g.label,
    n: view.discard.filter((t) => g.kinds.includes(view.tiles[t] as TileKind)).length,
  }));
  const plan = setupPlan(view.config);
  const gatesTotal = plan.pile.gate ?? 0;
  const gatesLeft = gatesTotal - (counts[1]?.n ?? 0);
  const need = view.prisoners.filter((p) => !p.hasKey).length;
  const keys = keysAvailable(view);
  return (
    <section className="panel discard" aria-label="Сброс">
      <h2 className="panel__title">Сброс</h2>
      <dl className="discard__grid">
        {counts.map((c) => (
          <div key={c.label}>
            <dt>{c.label}</dt>
            <dd>{c.n}</dd>
          </div>
        ))}
      </dl>
      <p className={`discard__status ${keys - need < 1 && need > 0 ? 'is-warn' : ''}`}>
        Ключей доступно: {keys}, нужно ещё: {need}
      </p>
      <p className={`discard__status ${gatesLeft <= 1 ? 'is-warn' : ''}`}>
        Врат осталось: {gatesLeft} из {gatesTotal}
      </p>
    </section>
  );
}

export function EventLog({
  view,
  events,
  batchStart,
  onHighlight,
}: {
  view: GameState;
  events: GameEvent[];
  batchStart: number;
  onHighlight(cells: Cell[]): void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const lines = useMemo(() => {
    const out: { i: number; text: string; cells: Cell[]; turn: boolean }[] = [];
    events.forEach((e, i) => {
      const text = formatEvent(e, view);
      if (text) out.push({ i, text, cells: eventCells(e), turn: e.type === 'turnStarted' });
    });
    return out.slice(-150);
  }, [events, view]);

  useEffect(() => {
    const el = ref.current;
    if (el && lines.length) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <section className="panel log" aria-label="Журнал">
      <h2 className="panel__title">Журнал</h2>
      <ol ref={ref} className="log__list" aria-live="polite">
        {lines.map((l) => (
          <li
            key={l.i}
            className={`${l.turn ? 'log__turn' : ''} ${l.i >= batchStart ? 'is-new' : ''}`}
          >
            {l.cells.length ? (
              <button type="button" onClick={() => onHighlight(l.cells)}>
                {l.text}
              </button>
            ) : (
              l.text
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
