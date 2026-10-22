import {
  type Action,
  cloneState,
  type Decision,
  Game,
  type GameConfig,
  type GameEvent,
  type GameState,
} from '@darkheaven/engine';
import { create } from 'zustand';
import { readJson, removeKey, writeJson } from './storage';

export interface SavedGame {
  v: 1;
  config: GameConfig;
  seed: string;
  actions: Action[];
  startedAt: number;
  finishedAt?: number;
}

const SAVE_KEY = 'darkheaven.save.v1';
const REPLAYS_KEY = 'darkheaven.replays.v1';

interface GameStore {
  game: Game | null;
  view: GameState | null;
  pending: Decision | null;
  events: GameEvent[];
  /** Номер первого события последней партии изменений (для анимаций и звука). */
  batchStart: number;
  /** Счётчик изменений, чтобы подписчики видели каждое действие. */
  rev: number;
  error: string | null;
  saved: SavedGame | null;
  newGame(config: GameConfig, seed: string): void;
  resume(): boolean;
  apply(action: Action): boolean;
  quit(): void;
}

function snapshot(game: Game, batchStart: number, rev: number) {
  return {
    game,
    view: cloneState(game.state),
    pending: game.pending ? (JSON.parse(JSON.stringify(game.pending)) as Decision) : null,
    events: [...game.events],
    batchStart,
    rev,
  };
}

function persist(game: Game, startedAt: number): SavedGame {
  const save: SavedGame = {
    v: 1,
    config: game.config,
    seed: game.seed,
    actions: [...game.actions],
    startedAt,
  };
  if (game.over) {
    save.finishedAt = Date.now();
    removeKey(SAVE_KEY);
    const replays = readJson<SavedGame[]>(REPLAYS_KEY) ?? [];
    writeJson(REPLAYS_KEY, [save, ...replays].slice(0, 10));
  } else {
    writeJson(SAVE_KEY, save);
  }
  return save;
}

export function loadSave(): SavedGame | null {
  const save = readJson<SavedGame>(SAVE_KEY);
  return save?.v === 1 ? save : null;
}

export function loadReplays(): SavedGame[] {
  return readJson<SavedGame[]>(REPLAYS_KEY) ?? [];
}

let startedAt = Date.now();

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  view: null,
  pending: null,
  events: [],
  batchStart: 0,
  rev: 0,
  error: null,
  saved: loadSave(),

  newGame(config, seed) {
    const game = new Game(config, seed);
    startedAt = Date.now();
    const saved = persist(game, startedAt);
    set({ ...snapshot(game, 0, get().rev + 1), error: null, saved });
  },

  resume() {
    const save = loadSave();
    if (!save) return false;
    try {
      const game = Game.replay(save.config, save.seed, save.actions);
      startedAt = save.startedAt;
      set({ ...snapshot(game, game.events.length, get().rev + 1), error: null, saved: save });
      return true;
    } catch {
      removeKey(SAVE_KEY);
      set({ saved: null });
      return false;
    }
  },

  apply(action) {
    const { game } = get();
    if (!game) return false;
    const before = game.events.length;
    const r = game.apply(action);
    if (!r.ok) {
      set({ error: r.error });
      return false;
    }
    const saved = persist(game, startedAt);
    set({ ...snapshot(game, before, get().rev + 1), error: null, saved: game.over ? null : saved });
    return true;
  },

  quit() {
    set({ game: null, view: null, pending: null, events: [], saved: loadSave() });
  },
}));
