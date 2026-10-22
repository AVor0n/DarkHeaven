import type { GameState } from '@darkheaven/engine';
import { LOSS_REASONS } from '../i18n/ru';
import type { SavedGame } from '../store/game';

export function downloadReplay(save: SavedGame) {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `darkheaven-${save.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EndScreen({
  view,
  onAgain,
  onSameSeed,
  onReplay,
  onMenu,
}: {
  view: GameState;
  onAgain(): void;
  onSameSeed(): void;
  onReplay(): void;
  onMenu(): void;
}) {
  const won = view.phase === 'won';
  const s = view.stats;
  return (
    <div className="overlay end" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className={`end__card ${won ? 'end__card--won' : 'end__card--lost'}`}>
        <h2 id="end-title">{won ? 'Врата открыты' : 'Тьма победила'}</h2>
        <p className="end__reason">
          {won
            ? 'Все узники собрались у врат с ключами и вырвались на свободу.'
            : view.lossReason
              ? LOSS_REASONS[view.lossReason]
              : 'Свечи погасли.'}
        </p>
        <dl className="end__stats">
          <div>
            <dt>Ходов</dt>
            <dd>{view.turn.number}</dd>
          </div>
          <div>
            <dt>Атак монстров</dt>
            <dd>{s.attacks}</dd>
          </div>
          <div>
            <dt>Попаданий</dt>
            <dd>{s.hits}</dd>
          </div>
          <div>
            <dt>Сгорело плиток</dt>
            <dd>{s.pileDiscarded}</dd>
          </div>
          <div>
            <dt>Падений</dt>
            <dd>{s.falls}</dd>
          </div>
          <div>
            <dt>Выложено плиток</dt>
            <dd>{s.tilesPlaced}</dd>
          </div>
        </dl>
        <div className="end__buttons">
          <button type="button" className="btn btn--primary" onClick={onAgain}>
            Ещё раз
          </button>
          <button type="button" className="btn" onClick={onSameSeed}>
            Тот же расклад
          </button>
          <button type="button" className="btn" onClick={onReplay}>
            Скачать реплей
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            В меню
          </button>
        </div>
      </div>
    </div>
  );
}
