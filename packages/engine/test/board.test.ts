import { describe, expect, it } from 'vitest';
import {
  cellAt,
  connected,
  litCells,
  monstersSeeing,
  neighbor,
  rotateMask,
  sightLine,
} from '../src/board';
import { E, N, S, W } from '../src/content';
import { at, scenario } from './helpers';

describe('геометрия', () => {
  it('поворачивает маски по часовой стрелке', () => {
    expect(rotateMask(N, 1)).toBe(E);
    expect(rotateMask(N | E, 1)).toBe(E | S);
    expect(rotateMask(E | S | W, 2)).toBe(W | N | E);
    expect(rotateMask(W, 1)).toBe(N);
  });

  it('переносит соседей через край поля', () => {
    expect(neighbor(6, cellAt(6, 0, 0), 0)).toBe(cellAt(6, 0, 5));
    expect(neighbor(6, cellAt(6, 0, 0), 3)).toBe(cellAt(6, 5, 0));
    expect(neighbor(6, cellAt(6, 5, 5), 1)).toBe(cellAt(6, 0, 5));
  });
});

describe('соединения и свет', () => {
  const game = scenario({
    map: `
      . . . . . .
      . ┌ ─ ┐ . .
      . │ . │ . .
      . └ ┬ ┘ . .
      . . . . . .
      . . . . . .`,
    prisoners: [{ at: [2, 1] }, { at: null }, { at: null }, { at: null }],
  });

  it('проверяет проход с обеих сторон', () => {
    const s = game.state;
    expect(connected(s, at(game, 1, 1), 1)).toBe(true);
    // Т-образный ┬ смотрит стеной на север: с ┘ сверху не соединён.
    expect(connected(s, at(game, 2, 3), 0)).toBe(false);
  });

  it('свеча освещает клетки по выходам, даже если там тупик', () => {
    const lit = litCells(game.state);
    expect(lit.has(at(game, 2, 1))).toBe(true);
    expect(lit.has(at(game, 1, 1))).toBe(true);
    expect(lit.has(at(game, 3, 1))).toBe(true);
    expect(lit.has(at(game, 2, 0))).toBe(false);
    expect(lit.has(at(game, 2, 2))).toBe(false);
  });
});

describe('линия видимости', () => {
  it('идёт по соединённым проходам, обрывается на Т-стене, пустоте и яме', () => {
    const game = scenario({
      map: `
        . ┼ . . . .
        . ┬ . . . .
        . │ . . . .
        ─ W ─ ─ . ─
        . │ . . . .
        . O . . . .`,
      prisoners: [{ at: null }, { at: null }, { at: null }, { at: null }],
    });
    const line = sightLine(game.state, at(game, 1, 3)).map((l) => l.cell);
    // Вверх: │, затем ┬ (вход снизу есть), дальше ┬ стеной на север — стоп.
    expect(line).toContain(at(game, 1, 2));
    expect(line).toContain(at(game, 1, 1));
    expect(line).not.toContain(at(game, 1, 0));
    // Вправо: два прохода, затем пустая клетка.
    expect(line).toContain(at(game, 2, 3));
    expect(line).toContain(at(game, 3, 3));
    expect(line).not.toContain(at(game, 4, 3));
    // Влево: проход у края и перенос на правый край.
    expect(line).toContain(at(game, 0, 3));
    expect(line).toContain(at(game, 5, 3));
    // Вниз: проход, затем яма.
    expect(line).toContain(at(game, 1, 4));
    expect(line).not.toContain(at(game, 1, 5));
  });

  it('находит монстров, видящих клетку', () => {
    const game = scenario({
      map: `
        . . . . . .
        . W ─ ─ W .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: null }, { at: null }, { at: null }, { at: null }],
    });
    expect(monstersSeeing(game.state, at(game, 2, 1)).sort()).toEqual(
      [at(game, 1, 1), at(game, 4, 1)].sort(),
    );
  });
});
