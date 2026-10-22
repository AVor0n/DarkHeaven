import type { Action, Decision, GameState, Rot, TileKind } from '@darkheaven/engine';
import { cellName, PRISONER_NAMES, playerName, prisonerName, TILE_NAMES } from '../i18n/ru';
import type { PreviewLine } from './previewText';

const PLACE_PROMPTS: Record<Extract<Decision, { kind: 'placeTile' }>['reason'], string> = {
  light: 'Свет выхватывает из тьмы новую плитку. Положите её в освещённую клетку.',
  setup: 'Выложите плитку у выхода стартового фрагмента.',
  darkMove: 'Шаг во тьму: положите вытянутую плитку и встаньте на неё.',
  landing: 'Приземление: положите вытянутую плитку.',
  stayMonster: 'Из запаса вышел монстр: он заменит одну из соседних плиток.',
  herald: 'Положите предвестника.',
};

function prompt(d: Decision, view: GameState): string {
  const pn = prisonerName(view, d.prisoner);
  switch (d.kind) {
    case 'placeStart':
      return `${pn}: выберите клетку для стартового фрагмента и поверните его.`;
    case 'action': {
      const p = view.prisoners[d.prisoner];
      if (d.extra) return 'Можно потратить решимость на ещё одно перемещение или закончить ход.';
      if (d.stay === 'forced') return 'Идти некуда — узник остаётся на месте.';
      if (p && !p.lit) return 'Свеча погашена: нужно двигаться, можно шагнуть во тьму.';
      return 'Куда идти? Выберите клетку или останьтесь на месте.';
    }
    case 'placeTile':
      return `${capitalizeFirst(TILE_NAMES[view.tiles[d.tile] as TileKind])}. ${PLACE_PROMPTS[d.reason]}`;
    case 'dodge':
      return `${pn} под ударом: потратить решимость и уклониться (сбросить ${d.amount - 1} вместо ${d.amount})?`;
    case 'fallLine':
      return `${pn} падает во тьму. Вдоль какой линии он приземлится?`;
    case 'landingCell':
      return d.draw
        ? `${pn} приземляется: выберите пустую клетку на линии, плитка будет вытянута из запаса.`
        : `${pn} приземляется: свободных клеток нет, выберите плитку на линии.`;
    case 'forcedMove':
      return `${pn} на клетке монстра и должен немедленно уйти.`;
    case 'flickerDiscard':
      return 'Последнее мерцание: тьма поглощает одну плитку. Выберите какую.';
    case 'mournerPlacement':
      return 'Явился Плакальщик. Выберите левый верхний угол его тени 3×3: она накроет предвестника, плитки под ней исчезнут, узники упадут.';
    case 'lightEaterTarget':
      return 'Пожиратель света ищет одинокую свечу. Чью свечу он погасит?';
  }
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ActionBarProps {
  view: GameState;
  pending: Decision;
  canConfirm: boolean;
  rotations: Rot[];
  preview: PreviewLine[] | null;
  error: string | null;
  hardcore: boolean;
  onConfirm(): void;
  onRotate(step: number): void;
  onAction(a: Action): void;
  onHoverStay(on: boolean): void;
  onHoverLine(index: number | null): void;
  onSurrender(): void;
}

export function ActionBar(props: ActionBarProps) {
  const { view, pending: d } = props;
  const decider = view.controllers[d.prisoner] ?? 0;
  const multi = view.config.players > 1;
  const p = view.prisoners[d.prisoner];
  const showRotate =
    (d.kind === 'placeTile' || d.kind === 'placeStart') && props.rotations.length > 1;
  return (
    <section className="actionbar" aria-label="Действия">
      <div className="actionbar__who">
        {p && <span className={`dot dot--${p.color}`} aria-hidden="true" />}
        <span>
          {p ? PRISONER_NAMES[p.color] : ''}
          {multi && <> · {playerName(view.config.playerNames, decider)}</>}
        </span>
      </div>
      <p className="actionbar__prompt">{prompt(d, view)}</p>
      {props.preview && !props.hardcore && (
        <ul className="actionbar__preview">
          {props.preview.map((l) => (
            <li key={l.text} className={`tone--${l.tone}`}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {props.error && <p className="actionbar__error">{props.error}</p>}
      <div className="actionbar__buttons">
        {showRotate && (
          <>
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => props.onRotate(-1)}
              title="Повернуть против часовой (Shift+R)"
            >
              ⟲
            </button>
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => props.onRotate(1)}
              title="Повернуть по часовой (R)"
            >
              ⟳
            </button>
          </>
        )}
        {d.kind === 'action' && d.stay && (
          <button
            type="button"
            className="btn"
            onClick={() => props.onAction({ type: 'stay' })}
            onMouseEnter={() => props.onHoverStay(true)}
            onMouseLeave={() => props.onHoverStay(false)}
            onFocus={() => props.onHoverStay(true)}
            onBlur={() => props.onHoverStay(false)}
            title="Пробел"
          >
            {d.stay === 'normal'
              ? 'Остаться'
              : d.stay === 'resolve'
                ? 'Остаться (−1 решимость)'
                : 'Остаться (ходов нет)'}
          </button>
        )}
        {d.kind === 'action' &&
          d.transfers.map((t) => (
            <button
              type="button"
              key={`${t.from}-${t.to}`}
              className="btn"
              onClick={() => props.onAction({ type: 'giveKey', from: t.from, to: t.to })}
            >
              Ключ: {prisonerName(view, t.from)} → {prisonerName(view, t.to)}
            </button>
          ))}
        {d.kind === 'dodge' && (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => props.onAction({ type: 'dodge', use: true })}
              title="1"
            >
              Уклониться (−1 решимость, −{d.amount - 1})
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => props.onAction({ type: 'dodge', use: false })}
              title="2"
            >
              Принять удар (−{d.amount})
            </button>
          </>
        )}
        {d.kind === 'fallLine' &&
          d.options.map((l, i) => (
            <button
              type="button"
              key={`${l.axis}-${l.index}`}
              className="btn btn--primary"
              onClick={() => props.onAction({ type: 'fallLine', index: i })}
              onMouseEnter={() => props.onHoverLine(i)}
              onMouseLeave={() => props.onHoverLine(null)}
              onFocus={() => props.onHoverLine(i)}
              onBlur={() => props.onHoverLine(null)}
              title={String(i + 1)}
            >
              {l.axis === 'row'
                ? `Строка ${l.index + 1}`
                : `Столбец ${String.fromCharCode(65 + l.index)}`}
            </button>
          ))}
        {d.kind === 'flickerDiscard' && d.canKeepFlame && (
          <button
            type="button"
            className="btn"
            onClick={() => props.onAction({ type: 'keepFlame' })}
          >
            Поддержать пламя (−1 решимость)
          </button>
        )}
        {d.kind === 'lightEaterTarget' &&
          d.targets.map((t) => (
            <button
              type="button"
              key={t}
              className="btn"
              onClick={() => props.onAction({ type: 'lightEaterTarget', prisoner: t })}
            >
              {prisonerName(view, t)}
            </button>
          ))}
        {d.kind === 'mournerPlacement' && (
          <span className="actionbar__hint">Предвестник в {cellName(view.size, d.heraldCell)}</span>
        )}
        {d.kind === 'action' && d.canEnd && (
          <button
            type="button"
            className="btn"
            onClick={() => props.onAction({ type: 'endTurn' })}
            title="E"
          >
            Закончить ход
          </button>
        )}
        {needsConfirm(d) && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!props.canConfirm}
            onClick={props.onConfirm}
            title="Enter"
          >
            Готово
          </button>
        )}
        <span className="actionbar__spacer" />
        <button type="button" className="btn btn--ghost" onClick={props.onSurrender}>
          Сдаться
        </button>
      </div>
    </section>
  );
}

function needsConfirm(d: Decision): boolean {
  return (
    d.kind === 'placeStart' ||
    d.kind === 'placeTile' ||
    d.kind === 'action' ||
    d.kind === 'forcedMove' ||
    d.kind === 'mournerPlacement'
  );
}
