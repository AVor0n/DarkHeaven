import { describe, expect, it } from 'vitest';
import { cloneState, previewMove, previewStay } from '../src/preview';
import type { TileKind } from '../src/types';
import { at, expectDecision, scenario } from './helpers';

const PILE: TileKind[] = [...Array(10).fill('cross'), 'gate', 'key', 'key', 'key', 'key'];
const ABSENT = { at: null } as const;

describe('превью хода', () => {
  it('показывает атаку, пострадавших и потерю запаса, не меняя состояние', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . │ . . .
        W ─ ┼ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2] }, { at: [3, 2] }, ABSENT, ABSENT],
      pile: PILE,
    });
    const before = cloneState(game.state);
    const d = expectDecision(game, 'action');
    const north = d.moves.find((m) => m.dir === 0);
    if (!north) throw new Error('нет хода на север');
    const p = previewMove(game.state, 0, north);
    expect(p.attacks.map((a) => a.monsterCell)).toEqual([at(game, 0, 2)]);
    expect(p.hits).toEqual([
      { prisoner: 1, monsterCell: at(game, 0, 2), amount: 3, dodgeable: true },
    ]);
    expect(p.pileLoss).toBe(3);
    expect(p.extinguishes).toEqual([1]);
    expect(game.state).toEqual(before);
  });

  it('предупреждает об обрушении и падении при «остаться» на прямом проходе', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . . │ . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 1 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    const p = previewStay(game.state, 0, 'normal');
    expect(p.falls).toBe(true);
    expect(p.gainsResolve).toBe(true);
    expect(p.draws).toBe(1);
  });

  it('ход в пустую клетку помечен как неизвестный', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], lit: false, resolve: 0 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    const d = expectDecision(game, 'action');
    const p = previewMove(game.state, 0, d.moves[0] as (typeof d.moves)[number]);
    expect(p.unknownTile).toBe(true);
  });
});
