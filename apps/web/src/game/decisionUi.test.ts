import { Game } from '@darkheaven/engine';
import { describe, expect, it } from 'vitest';
import { confirmAction, ghostFor, rotationsFor, targetsFor } from './decisionUi';

describe('decisionUi', () => {
  it('ведёт партию от расстановки до хода только через подсвеченные клетки', () => {
    const game = new Game({ players: 1 }, 'интерфейс');
    for (let i = 0; i < 40 && game.pending && game.pending.kind !== 'action'; i++) {
      const d = game.pending;
      const targets = targetsFor(d);
      expect(targets.size).toBeGreaterThan(0);
      const cell = [...targets.keys()][0] as number;
      const rot = rotationsFor(d, cell)[0] ?? null;
      const action = confirmAction(d, cell, rot);
      expect(action).not.toBeNull();
      if (d.kind === 'placeTile' || d.kind === 'placeStart') {
        expect(ghostFor(d, game.state, cell, rot)?.cell).toBe(cell);
      }
      expect(game.apply(action!)).toEqual({ ok: true });
    }
    expect(game.pending?.kind).toBe('action');
  });

  it('на старте подсвечено всё поле, а без выбора подтверждать нечего', () => {
    const game = new Game({ players: 1 }, 'интерфейс');
    const d = game.pending!;
    const outside = Array.from({ length: 36 }, (_, i) => i).find((c) => !targetsFor(d).has(c));
    expect(outside).toBeUndefined();
    expect(confirmAction(d, null, 0)).toBeNull();
  });
});
