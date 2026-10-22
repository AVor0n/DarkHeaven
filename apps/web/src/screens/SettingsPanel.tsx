import type { ReactNode } from 'react';
import { type AnimSpeed, type HintsMode, useSettings } from '../store/settings';

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
}) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            className={`segmented__item ${o.value === value ? 'is-on' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange(v: boolean): void;
  hint?: ReactNode;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__box" aria-hidden="true" />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  disabled?: boolean;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{Math.round(value * 100)}%</output>
    </label>
  );
}

export function SettingsPanel() {
  const s = useSettings();
  return (
    <div className="settings">
      <Choice<HintsMode>
        label="Подсказки"
        value={s.hints}
        options={[
          { value: 'normal', label: 'Обычные' },
          { value: 'hardcore', label: 'Хардкор' },
        ]}
        onChange={(hints) => s.set({ hints })}
      />
      <p className="settings__note">
        {s.hints === 'normal'
          ? 'Линии видимости монстров и превью последствий хода.'
          : 'Только подсветка допустимых ходов. Последствия считайте сами.'}
      </p>
      <Choice<AnimSpeed>
        label="Анимации"
        value={s.anim}
        options={[
          { value: 'normal', label: 'Обычные' },
          { value: 'fast', label: 'Быстрые' },
          { value: 'off', label: 'Без анимаций' },
        ]}
        onChange={(anim) => s.set({ anim })}
      />
      <Choice<number>
        label="Размер текста"
        value={s.fontScale}
        options={[
          { value: 0.9, label: 'Мелкий' },
          { value: 1, label: 'Обычный' },
          { value: 1.15, label: 'Крупный' },
          { value: 1.3, label: 'Очень крупный' },
        ]}
        onChange={(fontScale) => s.set({ fontScale })}
      />
      <Toggle
        label="Камера следует за узником"
        value={s.followCamera}
        onChange={(followCamera) => s.set({ followCamera })}
      />
      <Toggle
        label="Класть плитку сама, если вариант один"
        value={s.autoPlace}
        onChange={(autoPlace) => s.set({ autoPlace })}
      />
      <Toggle label="Без звука" value={s.muted} onChange={(muted) => s.set({ muted })} />
      <Slider
        label="Музыка"
        value={s.music}
        onChange={(music) => s.set({ music })}
        disabled={s.muted}
      />
      <Slider label="Эффекты" value={s.sfx} onChange={(sfx) => s.set({ sfx })} disabled={s.muted} />
      <Slider
        label="Эмбиент"
        value={s.ambient}
        onChange={(ambient) => s.set({ ambient })}
        disabled={s.muted}
      />
    </div>
  );
}
