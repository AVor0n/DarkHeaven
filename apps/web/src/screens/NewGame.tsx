import { COLORS, defaultControllers, type GameConfig, randomSeed } from '@darkheaven/engine';
import { useState } from 'react';
import { PRISONER_NAMES, playerName } from '../i18n/ru';
import { useGame } from '../store/game';
import { type HintsMode, useSettings } from '../store/settings';
import { readJson, writeJson } from '../store/storage';

const KEY = 'darkheaven.newgame.v1';

interface Form {
  players: number;
  names: string[];
  keyDelta: number;
  removeGate: boolean;
  chaos: boolean;
}

const DEFAULT_FORM: Form = {
  players: 1,
  names: ['', '', '', '', ''],
  keyDelta: 0,
  removeGate: false,
  chaos: false,
};

function distribution(players: number, names: string[]): string[] {
  const ctrl = defaultControllers(players);
  return ctrl.map((c, i) => {
    const color = COLORS[i];
    const who = players === 3 && i === 3 ? 'по очереди' : playerName(names, c);
    return `${color ? PRISONER_NAMES[color] : '?'} — ${who}`;
  });
}

export function NewGame({ onStart, onBack }: { onStart(): void; onBack(): void }) {
  const [form, setForm] = useState<Form>(() => ({
    ...DEFAULT_FORM,
    ...readJson<Partial<Form>>(KEY),
  }));
  const [seed, setSeed] = useState('');
  const hints = useSettings((s) => s.hints);
  const setSettings = useSettings((s) => s.set);
  const newGame = useGame((s) => s.newGame);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const start = () => {
    writeJson(KEY, form);
    const config: GameConfig = {
      players: form.players,
      playerNames: form.names
        .slice(0, form.players)
        .map((n, i) => n.trim() || playerName(undefined, i)),
      difficulty: { keyDelta: form.keyDelta, removeGate: form.removeGate, chaos: form.chaos },
    };
    newGame(config, seed.trim() || randomSeed());
    onStart();
  };

  return (
    <div className="page">
      <header className="page__header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Назад
        </button>
        <h1>Новая партия</h1>
      </header>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset className="field">
          <legend>Игроков за одним экраном</legend>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={`segmented__item ${form.players === n ? 'is-on' : ''}`}
                aria-pressed={form.players === n}
                onClick={() => patch({ players: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="field__hint">
            {form.players === 1
              ? 'Соло: вы ведёте всех четырёх узников.'
              : form.players === 5
                ? 'Пять узников, поле 7×7.'
                : 'Четыре узника, поле 6×6.'}
          </p>
        </fieldset>

        {form.players > 1 && (
          <fieldset className="field">
            <legend>Имена</legend>
            <div className="names">
              {Array.from({ length: form.players }, (_, i) => (
                <input
                  // biome-ignore lint/suspicious/noArrayIndexKey: порядок игроков фиксирован
                  key={i}
                  type="text"
                  maxLength={20}
                  placeholder={`Игрок ${i + 1}`}
                  value={form.names[i] ?? ''}
                  onChange={(e) => {
                    const names = [...form.names];
                    names[i] = e.target.value;
                    patch({ names });
                  }}
                />
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="field">
          <legend>Кто за кого</legend>
          <ul className="distribution">
            {distribution(form.players, form.names).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="field">
          <legend>Правила</legend>
          <div className="segmented">
            <button type="button" className="segmented__item is-on" aria-pressed="true">
              Базовые
            </button>
            <button type="button" className="segmented__item" disabled title="Скоро">
              Расширенные — скоро
            </button>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Сложность</legend>
          <div className="segmented">
            {[
              { v: 2, l: '+2 ключа' },
              { v: 1, l: '+1 ключ' },
              { v: 0, l: 'Стандарт' },
              { v: -1, l: '−1 ключ' },
            ].map((o) => (
              <button
                type="button"
                key={o.v}
                className={`segmented__item ${form.keyDelta === o.v ? 'is-on' : ''}`}
                aria-pressed={form.keyDelta === o.v}
                onClick={() => patch({ keyDelta: o.v })}
              >
                {o.l}
              </button>
            ))}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={form.removeGate}
              onChange={(e) => patch({ removeGate: e.target.checked })}
            />
            <span className="toggle__box" aria-hidden="true" />
            <span>Убрать одни врата</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={form.chaos}
              onChange={(e) => patch({ chaos: e.target.checked })}
            />
            <span className="toggle__box" aria-hidden="true" />
            <span>
              Хаос
              <small>два Т-образных прохода заменяются разрушающимися</small>
            </span>
          </label>
        </fieldset>

        <fieldset className="field">
          <legend>Подсказки</legend>
          <div className="segmented">
            {(
              [
                { v: 'normal', l: 'Обычные' },
                { v: 'hardcore', l: 'Хардкор' },
              ] as { v: HintsMode; l: string }[]
            ).map((o) => (
              <button
                type="button"
                key={o.v}
                className={`segmented__item ${hints === o.v ? 'is-on' : ''}`}
                aria-pressed={hints === o.v}
                onClick={() => setSettings({ hints: o.v })}
              >
                {o.l}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Расклад</legend>
          <div className="seed">
            <input
              type="text"
              placeholder="случайный"
              value={seed}
              maxLength={40}
              onChange={(e) => setSeed(e.target.value)}
              aria-label="Seed расклада"
            />
            <button type="button" className="btn btn--ghost" onClick={() => setSeed(randomSeed())}>
              Придумать
            </button>
          </div>
          <p className="field__hint">
            Одинаковый расклад даёт одинаковый порядок плиток — можно переиграть партию с друзьями.
          </p>
        </fieldset>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary btn--big">
            Зажечь свечи
          </button>
        </div>
      </form>
    </div>
  );
}
