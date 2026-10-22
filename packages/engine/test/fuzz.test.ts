import { describe, expect, it } from 'vitest';
import { listActions } from '../src/actions';
import { isGate, litCells, monsterAt } from '../src/board';
import { setupPlan } from '../src/content';
import { Game } from '../src/game';
import { createRng } from '../src/rng';
import type { Action, GameConfig, GameState } from '../src/types';
import { tileCount } from './helpers';

function checkInvariants(state: GameState): void {
  // После подготовки все физические плитки лежат на поле, в запасе, сбросе или рядом с полем.
  if (state.phase !== 'setup') expect(tileCount(state)).toBe(state.tiles.length);
  const cells = new Map<number, number>();
  for (const p of state.prisoners) {
    expect(p.resolve).toBeGreaterThanOrEqual(0);
    expect(p.resolve).toBeLessThanOrEqual(2);
    if (p.cell !== null) {
      expect(state.board[p.cell]).not.toBeNull();
      cells.set(p.cell, (cells.get(p.cell) ?? 0) + 1);
    }
  }
  for (const [cell, n] of cells) {
    if (n > 1) expect(isGate(state, cell)).toBe(true);
  }
  if (state.phase === 'play') {
    // Между действиями на поле только освещённые плитки (кроме хранителей ключей).
    const lit = litCells(state);
    state.board.forEach((bt, c) => {
      if (bt && !lit.has(c) && monsterAt(state, c) !== 'keyKeeper') {
        throw new Error(`Неосвещённая плитка в клетке ${c}`);
      }
    });
  }
}

/** Сыграть случайную партию, проверяя инварианты на каждом решении основного действия. */
function fuzz(config: GameConfig, seed: string): { game: Game; steps: number } {
  const game = new Game(config, seed);
  const rng = createRng(`bot-${seed}`);
  let steps = 0;
  while (game.pending && steps < 20000) {
    if (game.pending.kind === 'action' && !game.pending.extra) checkInvariants(game.state);
    const options = listActions(game.pending);
    expect(options.length).toBeGreaterThan(0);
    const moves = options.filter((a) => a.type === 'move');
    const pool = moves.length > 0 && rng() < 0.75 ? moves : options;
    const action = pool[Math.floor(rng() * pool.length)] as Action;
    const r = game.apply(action);
    if (!r.ok) throw new Error(`${r.error}: ${JSON.stringify(action)}`);
    steps++;
  }
  checkInvariants(game.state);
  return { game, steps };
}

describe('подготовка', () => {
  it('собирает 74 плитки в запас при 1–4 игроках и 73 при 5', () => {
    for (const players of [1, 2, 3, 4]) {
      const g = new Game({ players }, 'setup');
      expect(g.state.size).toBe(6);
      expect(g.state.prisoners).toHaveLength(4);
      expect(g.state.pile.length).toBe(74);
    }
    const five = new Game({ players: 5 }, 'setup');
    expect(five.state.size).toBe(7);
    expect(five.state.prisoners).toHaveLength(5);
    expect(five.state.pile.length).toBe(73);
  });

  it('кладёт начальное окружение на верх запаса', () => {
    const g = new Game({ players: 4 }, 'top');
    const top = g.state.pile.slice(-8).map((t) => g.state.tiles[t]);
    expect(top.every((k) => k === 't' || k === 'cross' || k === 'straight')).toBe(true);
    const plan = setupPlan({ players: 4 });
    expect(plan.initial).toEqual({ t: 4, cross: 2, straight: 2 });
  });

  it('один и тот же seed даёт одинаковый запас', () => {
    expect(new Game({ players: 4 }, 'a').state.pile).toEqual(
      new Game({ players: 4 }, 'a').state.pile,
    );
    expect(new Game({ players: 4 }, 'a').state.pile).not.toEqual(
      new Game({ players: 4 }, 'b').state.pile,
    );
  });
});

describe('фаззинг случайными партиями', () => {
  const configs: GameConfig[] = [
    { players: 1 },
    { players: 2 },
    { players: 3 },
    { players: 4 },
    { players: 5 },
    { players: 4, difficulty: { chaos: true, keyDelta: 2 } },
    { players: 4, difficulty: { removeGate: true, keyDelta: -1 } },
  ];
  for (const config of configs) {
    it(`партии доигрываются до конца: ${JSON.stringify(config)}`, () => {
      for (let i = 0; i < 60; i++) {
        const { game } = fuzz(config, `fuzz-${i}`);
        expect(game.pending).toBeNull();
        expect(['won', 'lost']).toContain(game.state.phase);
      }
    });
  }
});

describe('реплеи', () => {
  it('повтор действий восстанавливает то же состояние', () => {
    for (let i = 0; i < 20; i++) {
      const { game } = fuzz({ players: 4 }, `replay-${i}`);
      const copy = Game.replay(game.config, game.seed, game.actions);
      expect(copy.state).toEqual(game.state);
      expect(copy.events.length).toBe(game.events.length);
    }
  });

  it('частичный реплей ждёт то же решение', () => {
    const { game } = fuzz({ players: 2 }, 'partial');
    const half = game.actions.slice(0, Math.floor(game.actions.length / 2));
    const a = Game.replay(game.config, game.seed, half);
    const b = Game.replay(game.config, game.seed, half);
    expect(a.pending).toEqual(b.pending);
    expect(a.pending).not.toBeNull();
  });
});
