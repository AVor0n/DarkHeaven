import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game';
import type { GameEvent, TileKind } from '../src/types';
import { act, at, expectDecision, scenario } from './helpers';

const PILE: TileKind[] = [...Array(10).fill('cross'), 'gate', 'key', 'key', 'key', 'key'];
const ABSENT = { at: null } as const;

function events<T extends GameEvent['type']>(
  game: Game,
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return game.events.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

function kindAt(game: Game, x: number, y: number): TileKind | null {
  const bt = game.state.board[at(game, x, y)];
  return bt ? (game.state.tiles[bt.tile] ?? null) : null;
}

describe('исчадие тьмы', () => {
  it('при выкладке проваливает диагонали до края поля и себя, узники падают сразу', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . . . ┼ .
        . ┼ ┼ ┼ G .
        . . ┼ . ┼ .
        . . . . . .`,
      prisoners: [{ at: [2, 4] }, { at: [4, 4], resolve: 0 }, ABSENT, ABSENT],
      pile: ['darkSpawn', ...PILE],
    });
    act(game, { type: 'move', dir: 0 });
    const d = expectDecision(game, 'placeTile');
    expect(d.options.map((o) => o.cell)).toEqual([at(game, 2, 2)]);
    act(game, { type: 'placeTile', cell: at(game, 2, 2), rot: 0 });
    // Диагонали без переноса через край: (3,3) и (1,3) рядом, (4,4) дальше по диагонали.
    const opened = events(game, 'pitOpened').map((e) => e.cell);
    expect(opened).toEqual(
      expect.arrayContaining([at(game, 3, 3), at(game, 1, 3), at(game, 4, 4), at(game, 2, 2)]),
    );
    expect(events(game, 'pitOpened').every((e) => e.cause === 'spawn')).toBe(true);
    // Жёлтый стоял на (4,4) — падает, хотя ход не его.
    const fall = expectDecision(game, 'fallLine');
    expect(fall.prisoner).toBe(1);
    expect(game.state.prisoners[1]?.cell).toBeNull();
    // Исчадие не сжигает плитки из запаса.
    expect(events(game, 'pileDiscarded')).toHaveLength(0);
  });

  it('приземление на исчадие: оно срабатывает, узник падает снова (E1)', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . G .`,
      prisoners: [
        { at: null, fall: { axis: 'row', index: 2 }, resolve: 0 },
        { at: [4, 5] },
        ABSENT,
        ABSENT,
      ],
      pile: ['darkSpawn', ...PILE],
    });
    const land = expectDecision(game, 'landingCell');
    expect(land.draw).toBe(true);
    act(game, { type: 'landingCell', cell: at(game, 2, 2) });
    act(game, { type: 'placeTile', cell: at(game, 2, 2), rot: 0 });
    expect(game.state.board[at(game, 2, 2)]?.pit).toBe(true);
    const fall = expectDecision(game, 'fallLine');
    expect(fall.prisoner).toBe(0);
    expect(events(game, 'hit')).toHaveLength(0);
  });
});

describe('хранитель ключа', () => {
  it('вход с «верха» безопасен: ключ, вынужденный уход, хранитель становится ямой', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . . H . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 1] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    const d = expectDecision(game, 'action');
    expect(d.moves.find((m) => m.dir === 2)?.kind).toBe('keeper');
    act(game, { type: 'move', dir: 2 });
    expect(events(game, 'attack')).toHaveLength(0);
    expect(game.state.prisoners[0]?.hasKey).toBe(true);
    const forced = expectDecision(game, 'forcedMove');
    expect(forced.moves.map((m) => m.dir)).toContain(2);
    act(game, { type: 'move', dir: 2 });
    expect(game.state.board[at(game, 2, 2)]?.pit).toBe(true);
    expect(events(game, 'pitOpened').map((e) => e.cause)).toEqual(['keeper']);
  });

  it('издалека бьёт на 1 без уклонения и остаётся на поле даже в темноте', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        H ─ ─ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 1 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    const hits = events(game, 'hit');
    expect(hits).toEqual([{ type: 'hit', prisoner: 0, monsterCell: at(game, 0, 2), discard: 1 }]);
    expect(game.state.prisoners[0]?.lit).toBe(false);
    expect(game.state.prisoners[0]?.resolve).toBe(1);
    expect(kindAt(game, 0, 2)).toBe('keyKeeper');
  });
});

describe('Неотвратимый', () => {
  it('бьёт всю строку и весь столбец сквозь пустоты: −5 без уклонения', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        I ─ ─ ─ . .
        . . . . . .
        . . . . . .
        ┼ . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 1 }, { at: [0, 5], resolve: 1 }, ABSENT, ABSENT],
      pile: [...Array(12).fill('cross'), ...PILE],
    });
    act(game, { type: 'move', dir: 1 });
    expect(events(game, 'hit').map((h) => [h.prisoner, h.discard])).toEqual([
      [0, 5],
      [1, 5],
    ]);
    expect(events(game, 'resolveSpent')).toHaveLength(0);
    expect(game.state.board[at(game, 0, 2)]).toBeNull();
  });
});

describe('Плакальщик', () => {
  it('первый предвестник откладывается, второй вызывает жетон 3×3', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . . . ┼ .
        . ┼ ┼ . ┤ .
        . . ┼ . ┼ .
        . . . . . .`,
      prisoners: [{ at: [2, 4], resolve: 0 }, { at: [4, 3] }, ABSENT, ABSENT],
      pile: ['herald', 'cross', 'herald', ...PILE],
      config: { mourner: true },
    });
    act(game, { type: 'move', dir: 0 });
    // Первый предвестник ушёл в сторону, вместо него вытянут перекрёсток.
    const first = expectDecision(game, 'placeTile');
    expect(game.state.aside).toHaveLength(1);
    expect(first.options.map((o) => o.cell).sort()).toEqual([at(game, 2, 2), at(game, 3, 3)]);
    act(game, { type: 'placeTile', cell: at(game, 2, 2), rot: 0 });
    const herald = expectDecision(game, 'placeTile');
    expect(herald.reason).toBe('herald');
    act(game, { type: 'placeTile', cell: at(game, 3, 3), rot: 0 });
    const m = expectDecision(game, 'mournerPlacement');
    expect(m.heraldCell).toBe(at(game, 3, 3));
    expect(m.origins).toHaveLength(9);
    act(game, { type: 'mournerPlacement', origin: at(game, 1, 2) });
    // Красный под жетоном: −3 и падение.
    expect(events(game, 'hit')).toEqual([
      { type: 'hit', prisoner: 0, monsterCell: at(game, 3, 3), discard: 3 },
    ]);
    expectDecision(game, 'fallLine');
    act(game, { type: 'fallLine', index: 0 });
    for (const [x, y] of [
      [1, 2],
      [3, 3],
      [2, 4],
    ] as const) {
      expect(game.state.board[at(game, x, y)]?.mournerPit).toBe(1);
    }
    // Жёлтый освещает клетку ямы — жетон остаётся.
    expect(events(game, 'mournerPitRemoved')).toHaveLength(0);
    // Плитки под жетоном ушли в сброс, сам жетон плиткой не считается.
    expect(game.state.discard.map((t) => game.state.tiles[t])).toContain('herald');
  });

  it('яма исчезает целиком, когда ни одна её клетка не освещена', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . . . . .
        . . . ┼ ┼ ┼
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [3, 3] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
      config: { mourner: true },
    });
    for (const [x, y] of [
      [0, 2],
      [1, 2],
      [2, 2],
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 4],
      [1, 4],
      [2, 4],
    ] as const) {
      game.state.board[at(game, x, y)] = { tile: -1, rot: 0, pit: true, mournerPit: 1 };
    }
    act(game, { type: 'move', dir: 1 });
    const removed = events(game, 'mournerPitRemoved');
    expect(removed).toHaveLength(1);
    expect(removed[0]?.cells).toHaveLength(9);
    expect(game.state.board[at(game, 2, 3)]).toBeNull();
  });

  it('предвестник, открытый при сбросе от атаки, откладывается и замещается (E2)', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        W ─ ─ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 0 }, ABSENT, ABSENT, ABSENT],
      pile: ['herald', ...PILE],
      config: { mourner: true },
    });
    act(game, { type: 'move', dir: 1 });
    expect(game.state.aside.map((t) => game.state.tiles[t])).toEqual(['herald']);
    expect(events(game, 'pileDiscarded')[0]?.tiles).toHaveLength(3);
    expect(events(game, 'heraldSetAside')).toHaveLength(1);
  });
});

describe('Несущий Конец', () => {
  it('пятый предвестник приводит его, и в конце каждого хода сгорает плитка', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . ┼ ┼ ┼ . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2] }, ABSENT, ABSENT, ABSENT],
      pile: [...Array(5).fill('herald'), ...PILE],
      config: { endBearer: true },
    });
    act(game, { type: 'stay' });
    expect(game.state.aside).toHaveLength(5);
    expect(game.state.endBearerActive).toBe(true);
    expect(events(game, 'endBearerArrived')).toHaveLength(1);
    // «Остаться» сжигает одну плитку, Несущий Конец — по одной в конце каждого хода
    // (ходы трёх отсутствующих узников тоже считаются).
    expect(game.state.pile).toHaveLength(PILE.length - 5);
  });
});

describe('пожиратель света', () => {
  it('гасит свечу выбранного изолированного узника и становится ямой, если клетка освещена', () => {
    const game = scenario({
      map: `
        ┼ . . . . .
        . . . . . .
        . . . . . .
        . ┼ ┼ ┼ . .
        . . ┼ . . .
        . . . . . ┼`,
      prisoners: [{ at: [2, 4] }, { at: [0, 0] }, { at: [5, 5] }, ABSENT],
      pile: ['lightEater', ...PILE],
    });
    act(game, { type: 'move', dir: 0 });
    act(game, { type: 'placeTile', cell: at(game, 2, 2), rot: 0 });
    const d = expectDecision(game, 'lightEaterTarget');
    expect(d.targets).toEqual([0, 1, 2]);
    expect(d.cell).toBe(at(game, 2, 2));
    act(game, { type: 'lightEaterTarget', prisoner: 1 });
    expect(game.state.prisoners[1]?.lit).toBe(false);
    expect(game.state.board[at(game, 2, 2)]?.pit).toBe(true);
  });

  it('если погасил того, кто освещал его клетку, уходит в сброс', () => {
    const game = scenario({
      map: `
        ┼ . . . . .
        . . . . . .
        . . . . . .
        . ┼ ┼ ┼ . .
        . . ┼ . . .
        . . . . . .`,
      prisoners: [{ at: [2, 4] }, { at: [0, 0] }, ABSENT, ABSENT],
      pile: ['lightEater', ...PILE],
    });
    act(game, { type: 'move', dir: 0 });
    act(game, { type: 'placeTile', cell: at(game, 2, 2), rot: 0 });
    act(game, { type: 'lightEaterTarget', prisoner: 0 });
    expect(game.state.prisoners[0]?.lit).toBe(false);
    expect(game.state.board[at(game, 2, 2)]).toBeNull();
    expect(game.state.discard.map((t) => game.state.tiles[t])).toContain('lightEater');
  });

  it('вход на него в темноте: свеча гаснет, он бьёт другую цель, узник падает', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .
        . . . . . ┼`,
      prisoners: [{ at: [2, 2], lit: false, resolve: 0 }, { at: [5, 5] }, ABSENT, ABSENT],
      pile: ['lightEater', ...PILE],
    });
    act(game, { type: 'move', dir: 0 });
    act(game, { type: 'placeTile', cell: at(game, 2, 1), rot: 0 });
    // Единственная цель выбирается без вопроса.
    expect(events(game, 'lightEaten')).toEqual([
      { type: 'lightEaten', cell: at(game, 2, 1), prisoner: 1 },
    ]);
    expect(game.state.prisoners[1]?.lit).toBe(false);
    const fall = expectDecision(game, 'fallLine');
    expect(fall.prisoner).toBe(0);
  });
});

describe('прерыватель пути', () => {
  it('атака проваливает весь ряд по оси лиц, узники падают без сброса', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        Q ─ ─ ─ . ┼
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 0 }, { at: [5, 2], resolve: 0 }, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    expect(events(game, 'hit').map((h) => [h.prisoner, h.discard])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(events(game, 'pileDiscarded')).toHaveLength(0);
    for (const x of [1, 2, 3, 5]) expect(game.state.board[at(game, x, 2)]?.pit).toBe(true);
    // Сам прерыватель освещён жёлтым через край поля — тоже становится ямой.
    expect(game.state.board[at(game, 0, 2)]?.pit).toBe(true);
    expect(expectDecision(game, 'fallLine').prisoner).toBe(0);
    act(game, { type: 'fallLine', index: 1 });
    expect(expectDecision(game, 'fallLine').prisoner).toBe(1);
    expect(game.state.prisoners[0]?.lit).toBe(true);
  });

  it('при приземлении бьёт вдоль линии падения, а узник падает снова', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        ┼ ┼ P ┼ ┼ ┼
        . . . . . .
        . . . . . .
        . . . . G .`,
      prisoners: [
        { at: null, fall: { axis: 'row', index: 2 }, resolve: 0 },
        { at: [4, 5] },
        ABSENT,
        ABSENT,
      ],
      pile: PILE,
    });
    const land = expectDecision(game, 'landingCell');
    expect(land.draw).toBe(false);
    act(game, { type: 'landingCell', cell: at(game, 2, 2) });
    expect(events(game, 'hit')).toEqual([
      { type: 'hit', prisoner: 0, monsterCell: at(game, 2, 2), discard: 3 },
    ]);
    for (let x = 0; x < 6; x++) expect(game.state.board[at(game, x, 2)]?.pit).toBe(true);
    expect(game.state.prisoners[0]?.lit).toBe(true);
    expect(expectDecision(game, 'fallLine').prisoner).toBe(0);
  });
});
