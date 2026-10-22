import { create } from 'zustand';
import { readJson, writeJson } from './storage';

export type HintsMode = 'normal' | 'hardcore';
export type AnimSpeed = 'normal' | 'fast' | 'off';

export interface Settings {
  hints: HintsMode;
  anim: AnimSpeed;
  followCamera: boolean;
  /** Класть плитку автоматически, если вариант всего один. */
  autoPlace: boolean;
  muted: boolean;
  music: number;
  sfx: number;
  ambient: number;
  fontScale: number;
}

const KEY = 'darkheaven.settings.v1';

const DEFAULTS: Settings = {
  hints: 'normal',
  anim: 'normal',
  followCamera: true,
  autoPlace: true,
  muted: false,
  music: 0.5,
  sfx: 0.8,
  ambient: 0.5,
  fontScale: 1,
};

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsStore>((set) => ({
  ...DEFAULTS,
  ...readJson<Partial<Settings>>(KEY),
  set(patch) {
    set((s) => {
      const next = { ...s, ...patch };
      const { set: _omit, ...plain } = next;
      writeJson(KEY, plain);
      return next;
    });
  },
}));

const reducedMotion =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Длительность анимации с учётом настроек и prefers-reduced-motion (0 — без анимации). */
export function animMs(base: number): number {
  const anim = useSettings.getState().anim;
  if (anim === 'off' || reducedMotion?.matches) return 0;
  if (anim === 'fast') return Math.round(base / 2);
  return base;
}
