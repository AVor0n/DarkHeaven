import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game';
import type { TileKind } from '../src/types';
import { act, at, expectDecision, scenario } from './helpers';

/** Запас по умолчанию: безопасные плитки сверху, врата и ключи снизу (чтобы не было проигрыша). */
const PILE: TileKind[] = [...Array(10).fill('cross'), 'gate', 'key', 'key', 'key', 'key'];
const ABSENT = { at: null } as const;

function kinds(game: Game, tiles: number[]): TileKind[] {
  return tiles.map((t) => game.state.tiles[t] as TileKind);
}

describe('атаки пожирателя воска', () => {
  it('движение вдоль линии видимости вызывает атаку: −3 плитки и свеча гаснет', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        W ─ ─ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 0 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    const red = game.state.prisoners[0];
    expect(red?.lit).toBe(false);
    expect(game.state.pile.length).toBe(PILE.length - 3);
    expect(game.state.board[at(game, 0, 2)]).toBeNull();
    expect(game.events.some((e) => e.type === 'hit' && e.prisoner === 0)).toBe(true);
  });

  it('уход с линии провоцирует атаку, но ушедший последствий избегает', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . │ . . .
        W ─ ┼ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 0 }, { at: [3, 2], resolve: 0 }, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 0 });
    const [red, yellow] = game.state.prisoners;
    expect(red?.lit).toBe(true);
    expect(yellow?.lit).toBe(false);
    // −3 за атаку и ещё одна плитка уже вытянута для освещения.
    expect(game.state.pile.length).toBe(PILE.length - 4);
    // Красный освещает пустую клетку сверху — надо выложить плитку.
    const d = expectDecision(game, 'placeTile');
    expect(d.options.map((o) => o.cell)).toEqual([at(game, 2, 0)]);
  });

  it('цепная реакция: атака задевает второго монстра, тот атакует своих', () => {
    const game = scenario({
      map: `
        ┼ . │ . . .
        ┼ . │ . . .
        W ─ W . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [0, 1], resolve: 0 }, { at: [2, 0], resolve: 0 }, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 0 });
    const hits = game.events.filter((e) => e.type === 'hit');
    expect(hits.map((h) => (h.type === 'hit' ? [h.prisoner, h.monsterCell] : null))).toEqual([
      [0, at(game, 0, 2)],
      [1, at(game, 2, 2)],
    ]);
    expect(game.state.pile.length).toBe(PILE.length - 6);
    expect(game.state.board[at(game, 0, 2)]).toBeNull();
    expect(game.state.board[at(game, 2, 2)]).toBeNull();
  });

  it('уклонение за решимость уменьшает сброс до 2', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        W ─ ─ ─ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 1 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    expectDecision(game, 'dodge');
    act(game, { type: 'dodge', use: true });
    expect(game.state.pile.length).toBe(PILE.length - 2);
    expect(game.state.prisoners[0]?.resolve).toBe(0);
  });

  it('рывок на монстра: атака, затем вынужденное перемещение, монстр исчезает', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . ┼ W ┼ . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2], resolve: 1 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    const d = expectDecision(game, 'action');
    expect(d.moves.find((m) => m.dir === 1)?.kind).toBe('dash');
    act(game, { type: 'move', dir: 1 });
    expect(game.state.prisoners[0]?.lit).toBe(false);
    expectDecision(game, 'forcedMove');
    act(game, { type: 'move', dir: 0 });
    expect(game.state.prisoners[0]?.cell).toBe(at(game, 2, 1));
    expect(game.state.board[at(game, 2, 2)]).toBeNull();
    expect(game.state.pile.length).toBe(PILE.length - 3);
  });
});

describe('разрушение, «остаться на месте», падение', () => {
  it('разрушающийся проход становится ямой, когда с него уходят', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . . │ . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 0 });
    expect(game.state.board[at(game, 2, 2)]?.pit).toBe(true);
  });

  it('остаться: +1 решимость, верхняя плитка уходит в сброс, тратить решимость нельзя', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . ┼ ┼ ┼ . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], resolve: 1 }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'stay' });
    const red = game.state.prisoners[0];
    expect(red?.resolve).toBe(2);
    expect(game.state.discard.length).toBe(1);
    // Ход сразу завершился: окна дополнительных перемещений нет, снова ход красного.
    const d = expectDecision(game, 'action');
    expect(d.extra).toBe(false);
    expect(game.state.turn.number).toBe(5);
  });

  it('вытянутый при «остаться» монстр заменяет соседнюю плитку', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . ┼ ┼ ┼ . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2] }, ABSENT, ABSENT, ABSENT],
      pile: ['waxEater', ...PILE],
    });
    act(game, { type: 'stay' });
    const d = expectDecision(game, 'placeTile');
    expect(d.reason).toBe('stayMonster');
    expect(d.options).toHaveLength(4);
    act(game, { type: 'placeTile', cell: at(game, 2, 1), rot: 0 });
    const bt = game.state.board[at(game, 2, 1)];
    expect(bt && game.state.tiles[bt.tile]).toBe('waxEater');
    expect(game.events.some((e) => e.type === 'attack')).toBe(false);
  });

  it('остаться на разрушающейся плитке — падение, затем приземление в следующем ходу', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . . │ . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'stay' });
    const fall = expectDecision(game, 'fallLine');
    expect(fall.options).toEqual([
      { axis: 'row', index: 2 },
      { axis: 'col', index: 2 },
    ]);
    act(game, { type: 'fallLine', index: 0 });
    expect(game.state.prisoners[0]?.fall).toEqual({ axis: 'row', index: 2 });
    const land = expectDecision(game, 'landingCell');
    expect(land.draw).toBe(true);
    expect(land.cells).toHaveLength(6);
    act(game, { type: 'landingCell', cell: at(game, 4, 2) });
    act(game, { type: 'placeTile', cell: at(game, 4, 2), rot: 0 });
    expect(game.state.prisoners[0]?.cell).toBe(at(game, 4, 2));
    // После приземления освещаем новые проходы.
    expectDecision(game, 'placeTile');
  });
});

describe('свет', () => {
  it('погашенный узник входит в пустую клетку, вытягивая плитку только для неё', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . . ┼ . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [2, 2], lit: false, resolve: 0 }, ABSENT, ABSENT, ABSENT],
      pile: ['straight', ...PILE],
    });
    const d = expectDecision(game, 'action');
    expect(d.stay).toBeNull();
    expect(d.moves.map((m) => m.kind)).toEqual(['empty', 'empty', 'empty', 'empty']);
    act(game, { type: 'move', dir: 0 });
    const place = expectDecision(game, 'placeTile');
    expect(place.reason).toBe('darkMove');
    // Прямой проход должен соединиться снизу: повороты 0 и 2.
    expect(place.options[0]?.rotations).toEqual([0, 2]);
    act(game, { type: 'placeTile', cell: at(game, 2, 1), rot: 0 });
    expect(game.state.prisoners[0]?.cell).toBe(at(game, 2, 1));
    // Покинутая плитка не освещена — ушла в сброс.
    expect(game.state.board[at(game, 2, 2)]).toBeNull();
  });

  it('погашенная свеча загорается рядом с горящей', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . ┼ ┼ ┼ . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2], lit: false, resolve: 0 }, { at: [3, 2] }, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    expect(game.state.prisoners[0]?.lit).toBe(true);
    expect(game.events.some((e) => e.type === 'relit')).toBe(true);
  });
});

describe('ключи и победа', () => {
  it('ключ подбирается автоматически', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . ┼ K . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    expect(game.state.prisoners[0]?.hasKey).toBe(true);
    expect(game.state.board[at(game, 2, 2)]?.keyTaken).toBe(true);
  });

  it('ключ можно передать соседу по соединённому проходу', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . ┼ ┼ . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2], hasKey: true }, { at: [2, 2] }, ABSENT, ABSENT],
      pile: PILE,
    });
    const d = expectDecision(game, 'action');
    expect(d.transfers).toEqual([{ from: 0, to: 1 }]);
    act(game, { type: 'giveKey', from: 0, to: 1 });
    expect(game.state.prisoners[1]?.hasKey).toBe(true);
    expect(game.state.prisoners[0]?.hasKey).toBe(false);
  });

  it('победа, когда все узники с ключами собрались на вратах', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . ┼ G . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [
        { at: [1, 2], hasKey: true },
        { at: [2, 2], hasKey: true },
        { at: [2, 2], hasKey: true },
        { at: [2, 2], hasKey: true },
      ],
      pile: PILE,
    });
    act(game, { type: 'move', dir: 1 });
    expect(game.state.phase).toBe('won');
    expect(game.pending).toBeNull();
  });
});

describe('последнее мерцание и поражение', () => {
  it('в последнем мерцании каждый ход сбрасывается плитка; победа возможна', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . ┼ G ┼ . .
        . . ┼ . . .
        . . . . . .
        . . . . . .`,
      prisoners: [
        { at: [1, 2], hasKey: true, resolve: 0 },
        { at: [3, 2], hasKey: true, resolve: 0 },
        { at: [2, 1], hasKey: true, resolve: 0 },
        { at: [2, 3], hasKey: true, resolve: 0 },
      ],
      pile: [],
    });
    act(game, { type: 'move', dir: 1 });
    const d = expectDecision(game, 'flickerDiscard');
    expect(game.state.lastFlicker).toBe(true);
    expect(d.cells).toEqual([at(game, 1, 2)]);
    act(game, { type: 'flickerDiscard', cell: at(game, 1, 2) });
    act(game, { type: 'move', dir: 3 });
    act(game, { type: 'flickerDiscard', cell: at(game, 3, 2) });
    act(game, { type: 'move', dir: 2 });
    act(game, { type: 'flickerDiscard', cell: at(game, 2, 1) });
    act(game, { type: 'move', dir: 0 });
    expect(game.state.phase).toBe('won');
  });

  it('поражение, когда тьма поглотила последние врата', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        ┼ ┼ G . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2] }, ABSENT, ABSENT, ABSENT],
      pile: ['cross', 'cross', 'cross', 'key', 'key', 'key', 'key'],
    });
    act(game, { type: 'move', dir: 3 });
    expect(game.state.phase).toBe('lost');
    expect(game.state.lossReason).toBe('noGates');
  });

  it('падение при пустом запасе — поражение', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . ┼ . . .
        . . │ . . .
        . . ┼ . . .
        . . . . . .
        . . G . . .`,
      prisoners: [
        { at: [2, 2], hasKey: true },
        { at: null, hasKey: true },
        { at: null, hasKey: true },
        { at: null, hasKey: true },
      ],
      pile: [],
    });
    act(game, { type: 'stay' });
    act(game, { type: 'fallLine', index: 0 });
    expect(game.state.lossReason).toBe('fellNoTiles');
  });

  it('сдаться можно в любой момент', () => {
    const game = scenario({
      map: `
        . . . . . .
        . . . . . .
        . ┼ G . . .
        . . . . . .
        . . . . . .
        . . . . . .`,
      prisoners: [{ at: [1, 2] }, ABSENT, ABSENT, ABSENT],
      pile: PILE,
    });
    act(game, { type: 'surrender' });
    expect(game.state.phase).toBe('lost');
    expect(game.state.lossReason).toBe('surrender');
    expect(kinds(game, game.state.pile)).toHaveLength(PILE.length);
  });
});
