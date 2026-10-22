import {
  COLORS,
  defaultControllers,
  type GameConfig,
  randomSeed,
  setupPlan,
  type TileKind,
} from '@darkheaven/engine';
import { type ReactNode, useState } from 'react';
import { PRISONER_NAMES, playerName, TILE_NAMES } from '../i18n/ru';
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
  advanced: boolean;
  extraSpawn: boolean;
  inevitables: number;
  mourner: boolean;
  endBearer: boolean;
  lightEaters: number;
  pathBreakers: number;
  addOnly: boolean;
}

const DEFAULT_FORM: Form = {
  players: 1,
  names: ['', '', '', '', ''],
  keyDelta: 0,
  removeGate: false,
  chaos: false,
  advanced: false,
  extraSpawn: false,
  inevitables: 0,
  mourner: false,
  endBearer: false,
  lightEaters: 0,
  pathBreakers: 0,
  addOnly: false,
};

function toConfig(form: Form): GameConfig {
  return {
    players: form.players,
    playerNames: form.names
      .slice(0, form.players)
      .map((n, i) => n.trim() || playerName(undefined, i)),
    difficulty: { keyDelta: form.keyDelta, removeGate: form.removeGate, chaos: form.chaos },
    advanced: form.advanced,
    extraSpawn: form.advanced && form.extraSpawn,
    inevitables: form.inevitables,
    mourner: form.mourner,
    endBearer: form.endBearer,
    lightEaters: form.lightEaters,
    pathBreakers: form.pathBreakers,
    expansionAddOnly: form.addOnly,
  };
}

/** Порядок видов в сводке состава запаса. */
const PILE_ORDER: TileKind[] = [
  'key',
  'keyKeeper',
  'gate',
  'waxEater',
  'darkSpawn',
  'inevitable',
  'herald',
  'lightEater',
  'pathBreaker',
];

function pileSummary(config: GameConfig): string {
  const plan = setupPlan(config);
  const total = Object.values(plan.pile).reduce((a, b) => a + (b ?? 0), 0);
  const parts = PILE_ORDER.flatMap((k) => {
    const n = plan.pile[k] ?? 0;
    return n > 0 ? [`${TILE_NAMES[k]} ×${n}`] : [];
  });
  return `В запасе ${total} плиток: ${parts.join(', ')}, остальное — проходы.`;
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; l: string }[];
  onChange(v: T): void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          type="button"
          key={o.v}
          className={`segmented__item ${value === o.v ? 'is-on' : ''}`}
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  children: ReactNode;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

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
    newGame(toConfig(form), seed.trim() || randomSeed());
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
          <Choice
            value={form.advanced ? 'adv' : 'base'}
            options={[
              { v: 'base', l: 'Базовые' },
              { v: 'adv', l: 'Расширенные' },
            ]}
            onChange={(v) => patch({ advanced: v === 'adv' })}
          />
          <p className="field__hint">
            {form.advanced
              ? 'Ключи охраняют хранители, а исчадия тьмы обрушивают диагонали в ямы.'
              : 'Ключи лежат на фрагментах, из монстров — только пожиратели воска.'}
          </p>
          {form.advanced && (
            <Toggle checked={form.extraSpawn} onChange={(v) => patch({ extraSpawn: v })}>
              Третье исчадие тьмы
            </Toggle>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>Боссы</legend>
          <p className="field__label">Неотвратимые</p>
          <Choice
            value={form.inevitables}
            options={[
              { v: 0, l: 'Нет' },
              { v: 2, l: 'Два' },
              { v: 3, l: 'Три' },
            ]}
            onChange={(v) => patch({ inevitables: v })}
          />
          <Toggle checked={form.mourner} onChange={(v) => patch({ mourner: v })}>
            Плакальщик
            <small>второй предвестник накрывает поле ямой 3×3</small>
          </Toggle>
          <Toggle checked={form.endBearer} onChange={(v) => patch({ endBearer: v })}>
            Несущий Конец
            <small>после пятого предвестника запас тает каждый ход</small>
          </Toggle>
        </fieldset>

        <fieldset className="field">
          <legend>Набор монстров</legend>
          <p className="field__label">Пожиратели света</p>
          <Choice
            value={form.lightEaters}
            options={[0, 1, 2, 3, 4].map((v) => ({ v, l: v ? String(v) : 'Нет' }))}
            onChange={(v) => patch({ lightEaters: v })}
          />
          <p className="field__label">Прерыватели пути</p>
          <Choice
            value={form.pathBreakers}
            options={[0, 1, 2].map((v) => ({ v, l: v ? String(v) : 'Нет' }))}
            onChange={(v) => patch({ pathBreakers: v })}
          />
          <Toggle checked={form.addOnly} onChange={(v) => patch({ addOnly: v })}>
            Добавить без замены
            <small>новые монстры не вытесняют пожирателей воска — сложнее</small>
          </Toggle>
          <p className="field__hint">Фанатское дополнение по мотивам оригинала.</p>
        </fieldset>

        <fieldset className="field">
          <legend>Сложность</legend>
          <Choice
            value={form.keyDelta}
            options={[
              { v: 2, l: '+2 ключа' },
              { v: 1, l: '+1 ключ' },
              { v: 0, l: 'Стандарт' },
              { v: -1, l: '−1 ключ' },
            ]}
            onChange={(v) => patch({ keyDelta: v })}
          />
          <Toggle checked={form.removeGate} onChange={(v) => patch({ removeGate: v })}>
            Убрать одни врата
          </Toggle>
          <Toggle checked={form.chaos} onChange={(v) => patch({ chaos: v })}>
            Хаос
            <small>два Т-образных прохода заменяются разрушающимися</small>
          </Toggle>
        </fieldset>

        <fieldset className="field">
          <legend>Подсказки</legend>
          <Choice
            value={hints}
            options={
              [
                { v: 'normal', l: 'Обычные' },
                { v: 'hardcore', l: 'Хардкор' },
              ] as { v: HintsMode; l: string }[]
            }
            onChange={(v) => setSettings({ hints: v })}
          />
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

        <p className="form__summary">{pileSummary(toConfig(form))}</p>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary btn--big">
            Зажечь свечи
          </button>
        </div>
      </form>
    </div>
  );
}
