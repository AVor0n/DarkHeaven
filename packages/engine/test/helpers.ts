import { expect } from 'vitest';
import { listActions } from '../src/actions';
import { cellAt } from '../src/board';
import { createInitialState, Game } from '../src/game';
import { createRng } from '../src/rng';
import type { Action, Decision, GameState, Rot, TileKind } from '../src/types';

const TOKENS: Record<string, [TileKind, Rot, boolean?]> = {
  '│': ['straight', 0],
  '─': ['straight', 1],
  '┬': ['t', 0],
  '┤': ['t', 1],
  '┴': ['t', 2],
  '├': ['t', 3],
  '┌': ['start', 0],
  '┐': ['start', 1],
  '┘': ['start', 2],
  '└': ['start', 3],
  '┼': ['cross', 0],
  K: ['key', 0],
  G: ['gate', 0],
  W: ['waxEater', 0],
  I: ['inevitable', 0],
  O: ['cross', 0, true],
};

export interface PrisonerSpec {
  at: [number, number] | null;
  lit?: boolean;
  resolve?: number;
  hasKey?: boolean;
}

export interface ScenarioSpec {
  /** Строки поля, клетки разделены пробелами. */
  map: string;
  prisoners: PrisonerSpec[];
  /** Запас: первый элемент — верхняя плитка. */
  pile?: TileKind[];
  active?: number;
  players?: number;
}

/** Собрать партию с заданным полем в фазе 'play'. */
export function scenario(spec: ScenarioSpec): Game {
  const rows = spec.map
    .trim()
    .split('\n')
    .map((r) => r.trim().split(/\s+/));
  const size = rows.length;
  const base = createInitialState({ players: spec.players ?? 4 }, 'scenario');
  const tiles: TileKind[] = [];
  const board: GameState['board'] = Array.from({ length: size * size }, () => null);
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`Строка ${y} длины ${row.length}, ожидалось ${size}`);
    row.forEach((tok, x) => {
      if (tok === '.') return;
      const def = TOKENS[tok];
      if (!def) throw new Error(`Неизвестный символ ${tok}`);
      const id = tiles.length;
      tiles.push(def[0]);
      board[cellAt(size, x, y)] = { tile: id, rot: def[1], pit: !!def[2] };
    });
  });
  const pile: number[] = [];
  for (const kind of [...(spec.pile ?? [])].reverse()) {
    pile.push(tiles.length);
    tiles.push(kind);
  }
  const prisoners = spec.prisoners.map((p, i) => ({
    id: i,
    color: base.prisoners[i]?.color ?? 'red',
    cell: p.at ? cellAt(size, p.at[0], p.at[1]) : null,
    fall: null,
    lit: p.lit ?? true,
    resolve: p.resolve ?? 1,
    hasKey: p.hasKey ?? false,
  }));
  const state: GameState = {
    ...base,
    size,
    tiles,
    board,
    pile,
    discard: [],
    aside: [],
    prisoners,
    controllers: prisoners.map(() => 0),
    turn: { number: 1, active: spec.active ?? 0, gainedResolve: false, keyAtStart: false },
    phase: 'play',
  };
  return new Game(state.config, 'scenario', state);
}

export function at(game: Game, x: number, y: number): number {
  return cellAt(game.state.size, x, y);
}

/** Применить действие и убедиться, что оно принято. */
export function act(game: Game, action: Action): void {
  const r = game.apply(action);
  if (!r.ok) {
    throw new Error(`${r.error}; ожидалось ${JSON.stringify(game.pending)}`);
  }
}

export function expectDecision<K extends Decision['kind']>(
  game: Game,
  kind: K,
): Extract<Decision, { kind: K }> {
  expect(game.pending?.kind).toBe(kind);
  return game.pending as Extract<Decision, { kind: K }>;
}

/** Сыграть партию случайными допустимыми действиями. */
export function playRandom(game: Game, seed: string, maxSteps = 5000): number {
  const rng = createRng(seed);
  let steps = 0;
  while (game.pending && steps < maxSteps) {
    const options = listActions(game.pending);
    if (options.length === 0) throw new Error(`Нет действий для ${JSON.stringify(game.pending)}`);
    // Боту невыгодно бесконечно стоять: чаще выбираем перемещение.
    const moves = options.filter((a) => a.type === 'move');
    const pool = moves.length > 0 && rng() < 0.7 ? moves : options;
    const a = pool[Math.floor(rng() * pool.length)] as Action;
    act(game, a);
    steps++;
  }
  return steps;
}

/** Общее число плиток во всех зонах неизменно. */
export function tileCount(state: GameState): number {
  return (
    state.board.filter((b) => b !== null).length +
    state.pile.length +
    state.discard.length +
    state.aside.length
  );
}
