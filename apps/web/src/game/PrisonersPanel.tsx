import type { GameState } from '@darkheaven/engine';
import { CandleToken } from '../board/Prisoner';
import { cellName, PRISONER_NAMES, playerName } from '../i18n/ru';

function lineName(axis: 'row' | 'col', index: number): string {
  return axis === 'row' ? `строка ${index + 1}` : `столбец ${String.fromCharCode(65 + index)}`;
}

/** Список узников: свеча, решимость, ключ, кто управляет. */
export function PrisonersPanel({
  view,
  deciding,
  onFocus,
}: {
  view: GameState;
  deciding: number | null;
  onFocus(prisoner: number): void;
}) {
  const names = view.config.playerNames;
  const multi = view.config.players > 1;
  return (
    <section className="panel prisoners" aria-label="Узники">
      <h2 className="panel__title">Узники</h2>
      <ul>
        {view.prisoners.map((p) => {
          const active = view.turn.active === p.id;
          const state =
            p.cell === null
              ? p.fall
                ? `падает: ${lineName(p.fall.axis, p.fall.index)}`
                : 'во тьме'
              : cellName(view.size, p.cell);
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`prisoner ${active ? 'is-active' : ''} ${deciding === p.id ? 'is-deciding' : ''}`}
                onClick={() => onFocus(p.id)}
                title="Показать на поле"
              >
                <span className="prisoner__token">
                  <CandleToken prisoner={p} active={active} />
                </span>
                <span className="prisoner__body">
                  <span className="prisoner__name">
                    {PRISONER_NAMES[p.color]}
                    {multi && (
                      <span className="prisoner__player">
                        {playerName(names, view.controllers[p.id] ?? 0)}
                      </span>
                    )}
                  </span>
                  <span className="prisoner__stats">
                    <span className={p.lit ? 'stat stat--lit' : 'stat stat--out'}>
                      {p.lit ? 'свеча горит' : 'свеча погашена'}
                    </span>
                    <span
                      className="stat"
                      role="img"
                      title="Решимость"
                      aria-label={`Решимость ${p.resolve} из 2`}
                    >
                      {[0, 1].map((i) => (
                        <span key={i} className={`pip ${i < p.resolve ? 'pip--on' : ''}`} />
                      ))}
                    </span>
                    {p.hasKey && (
                      <span className="stat stat--key" title="Ключ">
                        ключ
                      </span>
                    )}
                  </span>
                  <span className="prisoner__where">{state}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
