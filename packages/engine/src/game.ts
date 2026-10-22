import {
  cellAt,
  cellsLitBy,
  cellXY,
  computeChain,
  connected,
  DIRS,
  diagonalCells,
  dirsLighting,
  hasExit,
  isGate,
  isMournerPit,
  isolatedPrisoners,
  keeperRotFacing,
  keeperTop,
  kindDef,
  litCells,
  monsterAt,
  monstersSeeing,
  neighbor,
  opposite,
  prisonersAt,
  reachable,
  rotationsWithExit,
  sightDirs,
  squareCells,
  squareOrigins,
  tileAt,
  turnOrderFrom,
  uniqueCells,
} from './board';
import { COLORS, defaultControllers, setupPlan } from './content';
import { createRng, shuffle } from './rng';
import type {
  Action,
  Cell,
  Decision,
  Dir,
  DiscardReason,
  FallLine,
  GameConfig,
  GameEvent,
  GameState,
  KeyTransfer,
  LossReason,
  MoveOption,
  PlacementOption,
  Prisoner,
  Rot,
  TileKind,
} from './types';
import { validateAction } from './validate';

export const ENGINE_VERSION = '0.2.0';

type Gen<T = void> = Generator<Decision, T, Action>;

class GameOver extends Error {}

const ALL_ROTS: Rot[] = [0, 1, 2, 3];

export function createInitialState(config: GameConfig, seed: string): GameState {
  const plan = setupPlan(config);
  const rng = createRng(seed);
  const tiles: TileKind[] = [];
  // Стартовые фрагменты получают id 0..prisoners-1.
  for (let i = 0; i < plan.prisoners; i++) tiles.push('start');
  const make = (kinds: Partial<Record<TileKind, number>>): number[] => {
    const ids: number[] = [];
    for (const [kind, count] of Object.entries(kinds) as [TileKind, number][]) {
      for (let i = 0; i < count; i++) {
        ids.push(tiles.length);
        tiles.push(kind);
      }
    }
    return ids;
  };
  const main = shuffle(make(plan.pile), rng);
  const initial = shuffle(make(plan.initial), rng);
  const pile = [...main, ...initial];
  const controllers = defaultControllers(config.players).slice(0, plan.prisoners);
  const prisoners: Prisoner[] = Array.from({ length: plan.prisoners }, (_, i) => ({
    id: i,
    color: COLORS[i] as Prisoner['color'],
    cell: null,
    fall: null,
    lit: true,
    resolve: 1,
    hasKey: false,
  }));
  return {
    config,
    size: plan.size,
    tiles,
    board: Array.from({ length: plan.size * plan.size }, () => null),
    pile,
    discard: [],
    aside: [],
    prisoners,
    controllers,
    turn: { number: 0, active: 0, gainedResolve: false, keyAtStart: false },
    lastFlicker: false,
    endBearerActive: false,
    heraldsRevealed: 0,
    phase: 'setup',
    lossReason: null,
    stats: { attacks: 0, hits: 0, pileDiscarded: 0, falls: 0, tilesPlaced: 0 },
  };
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Партия «Обители тьмы». Правила выполняются генератором, который
 * останавливается на каждом решении игрока (docs/spec/04-architecture.md §3).
 */
export class Game {
  readonly config: GameConfig;
  readonly seed: string;
  readonly state: GameState;
  readonly actions: Action[] = [];
  readonly events: GameEvent[] = [];
  pending: Decision | null = null;
  private readonly gen: Gen;
  /** Клетки монстров, которые уберутся, когда стоящий на них узник уйдёт. */
  private readonly pendingRemoval = new Set<Cell>();
  /** Предвестники Плакальщика, открытые при сбросе из запаса: ждут выкладки после атаки. */
  private readonly heraldQueue: { tile: number; prisoner: number | null }[] = [];

  /**
   * @param initial готовое состояние в фазе 'play' — для сценарных тестов;
   *   такую партию нельзя воспроизвести через replay.
   */
  constructor(config: GameConfig, seed: string, initial?: GameState) {
    this.config = config;
    this.seed = seed;
    this.state = initial ?? createInitialState(config, seed);
    this.gen = this.run();
    this.step(undefined);
  }

  static replay(config: GameConfig, seed: string, actions: Action[]): Game {
    const game = new Game(config, seed);
    for (const a of actions) {
      const r = game.apply(a);
      if (!r.ok) throw new Error(`Реплей не сходится на действии ${JSON.stringify(a)}: ${r.error}`);
    }
    return game;
  }

  get over(): boolean {
    return this.state.phase === 'won' || this.state.phase === 'lost';
  }

  /** Игрок, который должен принять текущее решение. */
  get pendingPlayer(): number | null {
    if (!this.pending) return null;
    return this.controllerOf(this.pending.prisoner);
  }

  controllerOf(prisoner: number): number {
    return this.state.controllers[prisoner] ?? 0;
  }

  apply(action: Action): ApplyResult {
    if (!this.pending) return { ok: false, error: 'Партия окончена' };
    if (action.type === 'surrender') {
      this.actions.push(action);
      this.state.phase = 'lost';
      this.state.lossReason = 'surrender';
      this.emit({ type: 'lost', reason: 'surrender' });
      this.pending = null;
      this.gen.return();
      return { ok: true };
    }
    const error = validateAction(this.pending, action);
    if (error) return { ok: false, error };
    this.actions.push(action);
    this.step(action);
    return { ok: true };
  }

  private step(action: Action | undefined): void {
    const r = action === undefined ? this.gen.next() : this.gen.next(action);
    this.pending = r.done ? null : r.value;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  // ───────────────────────── основной цикл ─────────────────────────

  private *run(): Gen {
    try {
      if (this.state.phase === 'setup') {
        yield* this.setupPhase();
        this.state.phase = 'play';
        this.state.turn.number = 1;
      }
      for (;;) {
        yield* this.playTurn();
        this.nextTurn();
      }
    } catch (e) {
      if (e instanceof GameOver) return;
      throw e;
    }
  }

  private *setupPhase(): Gen {
    const s = this.state;
    for (const p of s.prisoners) {
      s.turn.active = p.id;
      const cells = s.board.flatMap((bt, c) => (bt ? [] : [c]));
      const a = (yield { kind: 'placeStart', prisoner: p.id, cells }) as Extract<
        Action,
        { type: 'placeStart' }
      >;
      this.place(a.cell, p.id, a.rot, p.id);
      p.cell = a.cell;
      yield* this.fillFor(p, p.id, 'setup');
    }
    this.discardUnlit();
    s.turn.active = 0;
  }

  private *playTurn(): Gen {
    const s = this.state;
    const p = this.active();
    s.turn.gainedResolve = false;
    s.turn.keyAtStart = p.hasKey;
    this.emit({ type: 'turnStarted', prisoner: p.id, turn: s.turn.number });

    if (p.fall) yield* this.land(p);

    if (p.cell !== null) {
      // Основное действие: передвинуться или остаться.
      for (;;) {
        const d = this.actionDecision(p, false);
        const a = yield d;
        if (a.type === 'giveKey') {
          this.giveKey(a.from, a.to);
          continue;
        }
        if (a.type === 'stay') {
          yield* this.stay(p, d.kind === 'action' ? d.stay : null);
        } else if (a.type === 'move' && d.kind === 'action') {
          const opt = d.moves.find((m) => m.dir === a.dir) as MoveOption;
          if (opt.kind === 'dash') this.spendResolve(p, 1, 'dash');
          yield* this.moveProcedure(p, opt.dir, false);
        }
        break;
      }
      yield* this.lightAndDark();

      // Дополнительные перемещения за решимость и передача ключа.
      while (p.cell !== null) {
        const d = this.actionDecision(p, true);
        if (d.kind !== 'action' || (d.moves.length === 0 && d.transfers.length === 0)) break;
        const a = yield d;
        if (a.type === 'endTurn') break;
        if (a.type === 'giveKey') {
          this.giveKey(a.from, a.to);
          continue;
        }
        if (a.type === 'move') {
          const opt = d.moves.find((m) => m.dir === a.dir) as MoveOption;
          this.spendResolve(p, 1, 'extraMove');
          if (opt.kind === 'dash') this.spendResolve(p, 1, 'dash');
          yield* this.moveProcedure(p, opt.dir, false);
          yield* this.lightAndDark();
        }
      }
    }

    yield* this.endOfTurn(p);
  }

  private nextTurn(): void {
    const s = this.state;
    if (s.config.players === 3 && s.turn.active === 3) {
      s.controllers[3] = ((s.controllers[3] ?? 0) + 1) % 3;
    }
    s.turn.number += 1;
    s.turn.active = (s.turn.active + 1) % s.prisoners.length;
  }

  private *endOfTurn(p: Prisoner): Gen {
    const s = this.state;
    if (s.pile.length === 0 && !s.lastFlicker) {
      s.lastFlicker = true;
      this.emit({ type: 'lastFlicker' });
    }
    if (s.lastFlicker) {
      const cells = s.board.flatMap((bt, c) =>
        bt && !bt.mournerPit && prisonersAt(s, c).length === 0 ? [c] : [],
      );
      if (cells.length === 0) this.lose('flickerUnderPrisoner');
      const canKeepFlame = this.spendable(p) > 0;
      const a = yield { kind: 'flickerDiscard', prisoner: p.id, cells, canKeepFlame };
      if (a.type === 'keepFlame') {
        this.spendResolve(p, 1, 'keepFlame');
      } else if (a.type === 'flickerDiscard') {
        this.discardTileAt(a.cell, 'flicker');
        this.discardUnlit();
        this.checkLoss();
      }
    } else if (s.endBearerActive) {
      this.discardFromPile(1, null);
      yield* this.flushHeralds();
      if (s.pile.length === 0 && !s.lastFlicker) {
        s.lastFlicker = true;
        this.emit({ type: 'lastFlicker' });
      }
      this.checkLoss();
    }
  }

  // ───────────────────────── решения ─────────────────────────

  private active(): Prisoner {
    return this.state.prisoners[this.state.turn.active] as Prisoner;
  }

  /** Решимость, которую узник может потратить прямо сейчас. */
  spendable(p: Prisoner): number {
    if (p.id === this.state.turn.active && this.state.turn.gainedResolve) return 0;
    return p.resolve;
  }

  private actionDecision(p: Prisoner, extra: boolean): Decision {
    const moves = this.moveOptions(p, false, extra);
    const transfers = this.keyTransfers(p);
    let stay: 'normal' | 'resolve' | 'forced' | null = null;
    if (!extra) {
      if (p.lit) stay = 'normal';
      else if (moves.length === 0) stay = 'forced';
      else if (this.spendable(p) >= 1) stay = 'resolve';
    }
    return { kind: 'action', prisoner: p.id, extra, moves, stay, transfers, canEnd: extra };
  }

  /** Допустимые перемещения узника (docs/spec/01-rules.md §6.2). */
  moveOptions(p: Prisoner, forced: boolean, extra: boolean): MoveOption[] {
    const s = this.state;
    if (p.cell === null) return [];
    const from = p.cell;
    const budget = forced ? 0 : this.spendable(p);
    const base = extra ? 1 : 0;
    const out: MoveOption[] = [];
    for (const dir of DIRS) {
      if (!hasExit(s, from, dir)) continue;
      const to = neighbor(s.size, from, dir);
      const bt = tileAt(s, to);
      let opt: MoveOption | null = null;
      if (!bt) {
        if ((forced || !p.lit) && s.pile.length > 0) opt = { dir, to, kind: 'empty', cost: base };
      } else if (hasExit(s, to, opposite(dir))) {
        const monster = monsterAt(s, to);
        if (bt.pit) {
          opt = { dir, to, kind: 'pit', cost: base };
        } else if (monster) {
          if (monster === 'keyKeeper' && neighbor(s.size, to, keeperTop(bt.rot)) === from) {
            opt = { dir, to, kind: 'keeper', cost: base };
          } else if (!forced && sightDirs(s, to).length > 0) {
            opt = { dir, to, kind: 'dash', cost: base + 1 };
          }
        } else {
          const others = prisonersAt(s, to).filter((q) => q.id !== p.id);
          if (others.length === 0 || isGate(s, to)) opt = { dir, to, kind: 'tile', cost: base };
        }
      }
      if (opt && opt.cost <= budget) out.push(opt);
    }
    return out;
  }

  keyTransfers(p: Prisoner): KeyTransfer[] {
    const s = this.state;
    if (p.cell === null) return [];
    const out: KeyTransfer[] = [];
    for (const q of s.prisoners) {
      if (q.id === p.id || q.cell === null) continue;
      const near =
        q.cell === p.cell ||
        DIRS.some(
          (d) => neighbor(s.size, p.cell as Cell, d) === q.cell && connected(s, p.cell as Cell, d),
        );
      if (!near) continue;
      if (p.hasKey && !q.hasKey) out.push({ from: p.id, to: q.id });
      if (q.hasKey && !p.hasKey) out.push({ from: q.id, to: p.id });
    }
    return out;
  }

  // ───────────────────────── действия ─────────────────────────

  private *moveProcedure(p: Prisoner, dir: Dir, forced: boolean): Gen {
    const s = this.state;
    const from = p.cell as Cell;
    const to = neighbor(s.size, from, dir);
    const seenBefore = monstersSeeing(s, from);

    if (!tileAt(s, to)) {
      // Вход в пустую клетку: тянем плитку только для неё.
      const tile = this.drawForPlacement();
      if (tile === null) return;
      const back = opposite(dir);
      const def = kindDef(s, tile);
      const rotations =
        def.monster === 'keyKeeper' ? [keeperRotFacing(back)] : rotationsWithExit(def, [back]);
      const a = (yield {
        kind: 'placeTile',
        prisoner: p.id,
        tile,
        reason: 'darkMove',
        options: [{ cell: to, rotations }],
      }) as Extract<Action, { type: 'placeTile' }>;
      yield* this.placeAndTrigger(to, tile, a.rot, p.id, p);
      // Исчадие или Плакальщик могли уронить самого узника.
      if (p.cell !== from) return;
    }

    p.cell = to;
    this.emit({ type: 'moved', prisoner: p.id, from, to, dir, forced });

    // Покинутая плитка обрушается после атак: монстр видел движение по целому коридору (Т2).
    const dest = tileAt(s, to);
    if (!dest) return;
    if (dest.pit) {
      yield* this.startFall(p, to, seenBefore);
      this.afterLeaving(from);
      return;
    }
    this.pickKey(p, to);

    const monster = monsterAt(s, to);
    if (monster === 'keyKeeper') {
      const safe = neighbor(s.size, to, keeperTop(dest.rot)) === from;
      const provoked = safe
        ? uniqueCells([...seenBefore, ...monstersSeeing(s, to)]).filter((c) => c !== to)
        : uniqueCells([to, ...seenBefore, ...monstersSeeing(s, to)]);
      yield* this.resolveAttacks(provoked);
      this.afterLeaving(from);
      if (p.cell === to) yield* this.leaveKeeper(p, to);
    } else if (monster) {
      yield* this.resolveAttacks(uniqueCells([to, ...seenBefore, ...monstersSeeing(s, to)]));
      this.afterLeaving(from);
      if (p.cell === to) yield* this.forcedMove(p);
    } else {
      yield* this.resolveAttacks(uniqueCells([...seenBefore, ...monstersSeeing(s, to)]));
      this.afterLeaving(from);
    }
    this.relight();
    this.checkVictory();
  }

  /** Что происходит с плиткой, которую узник покинул: обрушение или уход монстра. */
  private afterLeaving(from: Cell): void {
    const s = this.state;
    const left = tileAt(s, from);
    if (!left) return;
    if (this.pendingRemoval.has(from)) {
      if (prisonersAt(s, from).length > 0) return;
      this.pendingRemoval.delete(from);
      if (!left.pit && monsterAt(s, from) === 'keyKeeper') {
        left.pit = true;
        this.emit({ type: 'pitOpened', cell: from, cause: 'keeper' });
      } else {
        this.discardTileAt(from, 'monster');
      }
    } else if (!left.pit && kindDef(s, left.tile).crumbling && prisonersAt(s, from).length === 0) {
      left.pit = true;
      this.emit({ type: 'crumbled', cell: from });
    }
  }

  /** Узник попал на хранителя: ключ, переворот в яму и вынужденный уход. */
  private *leaveKeeper(p: Prisoner, cell: Cell): Gen {
    const s = this.state;
    const bt = tileAt(s, cell);
    if (!bt || bt.pit) return;
    if (!p.hasKey) {
      p.hasKey = true;
      this.emit({ type: 'keyTaken', prisoner: p.id, cell });
    }
    bt.keyTaken = true;
    this.pendingRemoval.add(cell);
    yield* this.forcedMove(p);
  }

  /** Вынужденное перемещение с клетки монстра (docs/spec/01-rules.md §5.4). */
  private *forcedMove(q: Prisoner): Gen {
    const s = this.state;
    const cell = q.cell as Cell;
    const moves = this.moveOptions(q, true, false);
    if (moves.length === 0) {
      // Т5: идти некуда — плитка исчезает, узник падает.
      this.pendingRemoval.delete(cell);
      const bt = tileAt(s, cell);
      if (bt && !bt.pit) {
        if (monsterAt(s, cell) === 'keyKeeper') bt.pit = true;
        else this.discardTileAt(cell, 'monster');
      }
      yield* this.startFall(q, cell, []);
      return;
    }
    const a = (yield { kind: 'forcedMove', prisoner: q.id, moves }) as Extract<
      Action,
      { type: 'move' }
    >;
    yield* this.moveProcedure(q, a.dir, true);
  }

  private *stay(p: Prisoner, mode: 'normal' | 'resolve' | 'forced' | null): Gen {
    const s = this.state;
    this.emit({ type: 'stayed', prisoner: p.id });
    if (mode === 'resolve') {
      this.spendResolve(p, 1, 'darkStay');
    } else if (mode === 'normal') {
      if (p.resolve < 2) {
        p.resolve += 1;
        s.turn.gainedResolve = true;
        this.emit({ type: 'resolveGained', prisoner: p.id });
      }
      const tile = this.drawForPlacement();
      if (tile !== null) {
        if (s.tiles[tile] === 'lightEater') {
          // Трактовка E6: срабатывает и уходит в сброс — клетки для него нет.
          yield* this.lightEaterStrikes(null, p.id, null);
          s.discard.push(tile);
          s.stats.pileDiscarded += 1;
          this.emit({ type: 'pileDiscarded', tiles: [tile], prisoner: p.id });
          this.checkLoss();
        } else if (kindDef(s, tile).monster) yield* this.stayMonster(p, tile, p.id);
        else {
          s.discard.push(tile);
          s.stats.pileDiscarded += 1;
          this.emit({ type: 'pileDiscarded', tiles: [tile], prisoner: p.id });
          this.checkLoss();
        }
      }
    }
    const cell = p.cell;
    if (cell === null) return;
    const bt = tileAt(s, cell);
    if (bt && !bt.pit && kindDef(s, bt.tile).crumbling) {
      const seen = monstersSeeing(s, cell);
      bt.pit = true;
      this.emit({ type: 'crumbled', cell });
      yield* this.startFall(p, cell, seen);
    }
  }

  /**
   * Монстр, вытянутый при «остаться на месте», заменяет соседнюю плитку (§6.3).
   * Так же выкладывается предвестник Плакальщика, открытый при сбросе (трактовка E2).
   */
  private *stayMonster(p: Prisoner, tile: number, decider: number): Gen {
    const s = this.state;
    const cell = p.cell as Cell;
    const around = DIRS.filter((d) => hasExit(s, cell, d))
      .map((d) => neighbor(s.size, cell, d))
      .filter(
        (c, i, arr) =>
          arr.indexOf(c) === i &&
          c !== cell &&
          tileAt(s, c) !== null &&
          !isMournerPit(tileAt(s, c)),
      );
    const free = around.filter((c) => !monsterAt(s, c) && prisonersAt(s, c).length === 0);
    const occupied = around.filter((c) => !monsterAt(s, c) && prisonersAt(s, c).length > 0);
    const monsters = around.filter((c) => !!monsterAt(s, c));
    const candidates = free.length ? free : occupied.length ? occupied : monsters;
    if (candidates.length === 0) {
      s.discard.push(tile);
      this.emit({ type: 'pileDiscarded', tiles: [tile], prisoner: p.id });
      return;
    }
    const def = kindDef(s, tile);
    const options: PlacementOption[] = candidates.map((c) => {
      const toP = DIRS.find((d) => neighbor(s.size, c, d) === cell) ?? 0;
      return {
        cell: c,
        rotations: def.monster === 'keyKeeper' ? [keeperRotFacing(toP)] : ALL_ROTS,
      };
    });
    const a = (yield {
      kind: 'placeTile',
      prisoner: decider,
      tile,
      reason: s.tiles[tile] === 'herald' ? 'herald' : 'stayMonster',
      options,
    }) as Extract<Action, { type: 'placeTile' }>;
    this.discardTileAt(a.cell, 'replaced');
    yield* this.placeAndTrigger(a.cell, tile, a.rot, decider, null);
    const victims = prisonersAt(s, a.cell);
    if (victims.length > 0 && sightDirs(s, a.cell).length > 0) {
      yield* this.resolveAttacks([a.cell]);
      for (const q of victims) {
        if (q.cell === a.cell) {
          if (monsterAt(s, a.cell) === 'keyKeeper') yield* this.leaveKeeper(q, a.cell);
          else yield* this.forcedMove(q);
        }
      }
      this.relight();
    }
  }

  // ───────────────────────── падение ─────────────────────────

  private *startFall(q: Prisoner, cell: Cell, seenBy: Cell[]): Gen {
    const s = this.state;
    const [x, y] = cellXY(s.size, cell);
    const options: FallLine[] = [
      { axis: 'row', index: y },
      { axis: 'col', index: x },
    ];
    q.cell = null;
    s.stats.falls += 1;
    this.emit({ type: 'fell', prisoner: q.id, cell });
    const a = (yield { kind: 'fallLine', prisoner: q.id, cell, options }) as Extract<
      Action,
      { type: 'fallLine' }
    >;
    q.fall = options[a.index] as FallLine;
    this.emit({ type: 'fallLineChosen', prisoner: q.id, line: q.fall });
    if (s.pile.length === 0) this.lose('fellNoTiles');
    yield* this.resolveAttacks(seenBy);
    this.relight();
  }

  private lineCells(line: FallLine): Cell[] {
    const n = this.state.size;
    return Array.from({ length: n }, (_, i) =>
      line.axis === 'row' ? cellAt(n, i, line.index) : cellAt(n, line.index, i),
    );
  }

  private *land(p: Prisoner): Gen {
    const s = this.state;
    const line = p.fall as FallLine;
    const cells = this.lineCells(line);
    const lit = litCells(s);
    const empty = cells.filter((c) => !tileAt(s, c) && !lit.has(c));
    let cell: Cell;
    if (empty.length > 0) {
      if (s.pile.length === 0) this.lose('fellNoTiles');
      const a = (yield {
        kind: 'landingCell',
        prisoner: p.id,
        cells: empty,
        draw: true,
      }) as Extract<Action, { type: 'landingCell' }>;
      const tile = this.drawForPlacement();
      if (tile === null) this.lose('fellNoTiles');
      const r = (yield {
        kind: 'placeTile',
        prisoner: p.id,
        tile: tile as number,
        reason: 'landing',
        options: [{ cell: a.cell, rotations: ALL_ROTS }],
      }) as Extract<Action, { type: 'placeTile' }>;
      yield* this.placeAndTrigger(a.cell, tile as number, r.rot, p.id, p);
      cell = a.cell;
    } else {
      let options = cells.filter(
        (c) =>
          tileAt(s, c) && !tileAt(s, c)?.pit && (prisonersAt(s, c).length === 0 || isGate(s, c)),
      );
      if (options.length === 0) options = cells.filter((c) => tileAt(s, c));
      if (options.length === 0) this.lose('fellNoTiles');
      const a = (yield {
        kind: 'landingCell',
        prisoner: p.id,
        cells: options,
        draw: false,
      }) as Extract<Action, { type: 'landingCell' }>;
      cell = a.cell;
    }
    p.cell = cell;
    p.fall = null;
    this.emit({ type: 'landed', prisoner: p.id, cell });
    const bt = tileAt(s, cell);
    if (bt?.pit) {
      // Приземлился в яму (исчадие, Плакальщик, пожиратель света) — падает снова.
      yield* this.startFall(p, cell, []);
      yield* this.lightAndDark();
      return;
    }
    this.pickKey(p, cell);
    const monster = monsterAt(s, cell);
    if (monster === 'keyKeeper') {
      yield* this.resolveAttacks([cell]);
      if (p.cell === cell) yield* this.leaveKeeper(p, cell);
    } else if (monster === 'pathBreaker') {
      // Прерыватель бьёт вдоль выбранной линии падения.
      yield* this.resolveAttacks([cell], new Map([[cell, line.axis === 'row' ? 1 : 0]]));
    } else if (monster && sightDirs(s, cell).length > 0) {
      yield* this.resolveAttacks([cell]);
      if (p.cell === cell) yield* this.forcedMove(p);
    }
    this.relight();
    this.checkVictory();
    yield* this.lightAndDark();
  }

  // ───────────────────────── атаки ─────────────────────────

  /**
   * Разрешить атаки спровоцированных монстров (docs/spec/01-rules.md §5.3).
   * axes — направление атаки прерывателя пути, если оно не по оси его лиц.
   */
  private *resolveAttacks(provoked: Cell[], axes?: ReadonlyMap<Cell, Dir>): Gen {
    const s = this.state;
    // Монстр, уже атаковавший и ждущий ухода узника со своей клетки, больше не активен.
    const valid = uniqueCells(provoked).filter(
      (c) => sightDirs(s, c).length > 0 && !this.pendingRemoval.has(c),
    );
    if (valid.length === 0) return;
    const chain = computeChain(s, valid, this.pendingRemoval, axes);
    for (const m of chain.monsters) {
      const bt = tileAt(s, m);
      s.stats.attacks += 1;
      this.emit({
        type: 'attack',
        monsterCell: m,
        tile: bt?.tile ?? -1,
        area: chain.areas.get(m) ?? [],
        targets: chain.hits.filter((h) => h.monsterCell === m).map((h) => h.prisoner),
      });
    }
    for (const hit of chain.hits) {
      const q = s.prisoners[hit.prisoner] as Prisoner;
      const kind = monsterAt(s, hit.monsterCell);
      if (kind === 'pathBreaker') {
        if (q.cell === hit.monsterCell) {
          // Узник на самом прерывателе сбрасывает 3, свеча не гаснет; затем он упадёт.
          yield* this.strike(q, hit.monsterCell, 3, true, false);
        } else {
          // Остальных задевает обрушение ряда: они упадут вместе с плитками.
          s.stats.hits += 1;
          this.emit({ type: 'hit', prisoner: q.id, monsterCell: hit.monsterCell, discard: 0 });
        }
      } else if (kind === 'keyKeeper' && q.cell !== hit.monsterCell) {
        yield* this.strike(q, hit.monsterCell, 1, false);
      } else if (kind === 'inevitable') {
        yield* this.strike(q, hit.monsterCell, 5, false);
      } else {
        yield* this.strike(q, hit.monsterCell, 3, true);
      }
    }
    // Ряды прерывателей проваливаются, затем уходят остальные монстры.
    const pitted: Cell[] = [];
    const breakers = chain.monsters.filter((m) => monsterAt(s, m) === 'pathBreaker');
    const seen = this.seenSnapshot(
      uniqueCells(breakers.flatMap((m) => [m, ...(chain.areas.get(m) ?? [])])),
      chain.monsters,
    );
    const lit = litCells(s);
    for (const m of breakers) {
      for (const c of chain.areas.get(m) ?? []) {
        if (this.flipToPit(c, 'pathBreaker')) pitted.push(c);
      }
      if (prisonersAt(s, m).length > 0 || lit.has(m)) {
        if (this.flipToPit(m, 'pathBreaker')) pitted.push(m);
      } else {
        this.discardTileAt(m, 'monster');
      }
    }
    for (const m of chain.monsters) {
      const kind = monsterAt(s, m);
      if (!kind || kind === 'keyKeeper' || kind === 'pathBreaker') continue;
      if (prisonersAt(s, m).length > 0) this.pendingRemoval.add(m);
      else this.discardTileAt(m, 'monster');
    }
    this.relight();
    this.checkLoss();
    yield* this.dropPrisoners(pitted, seen);
    yield* this.flushHeralds();
  }

  /** Попадание по узнику: сброс из запаса (с уклонением за решимость) и гаснущая свеча. */
  private *strike(
    q: Prisoner,
    source: Cell,
    amount: number,
    canDodge: boolean,
    extinguish = true,
  ): Gen {
    const s = this.state;
    let discard = amount;
    if (canDodge && amount === 3 && this.spendable(q) > 0 && s.pile.length >= 3) {
      const a = (yield {
        kind: 'dodge',
        prisoner: q.id,
        monsterCell: source,
        amount,
      }) as Extract<Action, { type: 'dodge' }>;
      if (a.use) {
        this.spendResolve(q, 1, 'dodge');
        discard = 2;
      }
    }
    s.stats.hits += 1;
    this.emit({ type: 'hit', prisoner: q.id, monsterCell: source, discard });
    this.discardFromPile(discard, q.id);
    if (extinguish && q.lit) {
      q.lit = false;
      this.emit({ type: 'extinguished', prisoner: q.id });
    }
  }

  // ───────────────────────── особые монстры ─────────────────────────

  /**
   * Тянуть плитку для выкладки. Отложенные предвестники сразу заменяются
   * следующей плиткой; предвестник, вызывающий Плакальщика, выкладывается.
   */
  private drawForPlacement(): number | null {
    for (;;) {
      const tile = this.draw();
      if (tile === null || this.state.tiles[tile] !== 'herald') return tile;
      if (this.revealHerald(tile) === 'mourner') return tile;
    }
  }

  /** Открыт предвестник (docs/spec/02-extended-rules.md §3.2, §4.3). */
  private revealHerald(tile: number): 'aside' | 'mourner' {
    const s = this.state;
    s.heraldsRevealed += 1;
    const n = s.heraldsRevealed;
    if (s.config.mourner && n === 2) return 'mourner';
    s.aside.push(tile);
    this.emit({ type: 'heraldSetAside', tile, count: n });
    if (s.config.endBearer && n === 5) {
      s.endBearerActive = true;
      this.emit({ type: 'endBearerArrived' });
    }
    return 'aside';
  }

  /** Предвестники Плакальщика, открытые при сбросе, заменяют плитку рядом с узником. */
  private *flushHeralds(): Gen {
    const s = this.state;
    while (this.heraldQueue.length > 0) {
      const { tile, prisoner } = this.heraldQueue.shift() as {
        tile: number;
        prisoner: number | null;
      };
      s.aside.splice(s.aside.indexOf(tile), 1);
      const owner = prisoner === null ? null : (s.prisoners[prisoner] as Prisoner);
      // Узник, чей сброс открыл предвестника; если он уже упал — активный.
      const anchor = [owner, this.active()].find((q) => q && q.cell !== null) ?? null;
      if (!anchor) {
        s.discard.push(tile);
        this.emit({ type: 'pileDiscarded', tiles: [tile], prisoner });
        continue;
      }
      yield* this.stayMonster(anchor, tile, s.turn.active);
    }
  }

  /**
   * Положить плитку и применить её свойство «при выкладке».
   * entrant — узник, который сразу встанет на неё (вход в темноте, приземление).
   */
  private *placeAndTrigger(
    cell: Cell,
    tile: number,
    rot: Rot,
    decider: number,
    entrant: Prisoner | null,
  ): Gen {
    this.place(cell, tile, rot, decider);
    switch (this.state.tiles[tile]) {
      case 'darkSpawn':
        yield* this.spawnDarkness(cell);
        break;
      case 'herald':
        yield* this.summonMourner(cell, decider);
        break;
      case 'lightEater':
        yield* this.lightEaterStrikes(cell, decider, entrant);
        break;
      default:
        break;
    }
  }

  /** Исчадие тьмы: диагонали до края поля и оно само становятся ямами (§2.2). */
  private *spawnDarkness(cell: Cell): Gen {
    const s = this.state;
    const cells = [...diagonalCells(s.size, cell), cell];
    const seen = this.seenSnapshot(cells, []);
    const pitted = cells.filter((c) => this.flipToPit(c, 'spawn'));
    yield* this.dropPrisoners(pitted, seen);
  }

  /** Плакальщик накрывает предвестника жетоном 3×3 (§3.2). */
  private *summonMourner(heraldCell: Cell, decider: number): Gen {
    const s = this.state;
    const origins = squareOrigins(s.size, heraldCell);
    const a = (yield {
      kind: 'mournerPlacement',
      prisoner: decider,
      heraldCell,
      origins,
    }) as Extract<Action, { type: 'mournerPlacement' }>;
    const cells = squareCells(s.size, a.origin);
    const seen = this.seenSnapshot(cells, []);
    for (const [c, monsters] of seen) {
      seen.set(
        c,
        monsters.filter((m) => !cells.includes(m)),
      );
    }
    this.emit({ type: 'mournerPlaced', origin: a.origin, cells });
    for (const c of cells) this.discardTileAt(c, 'mourner');
    for (const c of cells) s.board[c] = { tile: -1, rot: 0, pit: true, mournerPit: 1 };
    for (const pi of turnOrderFrom(s, s.turn.active)) {
      const q = s.prisoners[pi] as Prisoner;
      if (q.cell !== null && cells.includes(q.cell)) yield* this.strike(q, heraldCell, 3, true);
    }
    this.checkLoss();
    yield* this.dropPrisoners(cells, seen);
  }

  /**
   * Пожиратель света гасит свечу изолированного узника (§4.1). Если на него
   * вошёл узник, гаснет и его свеча, а плитка становится ямой.
   */
  private *lightEaterStrikes(cell: Cell | null, decider: number, entrant: Prisoner | null): Gen {
    const s = this.state;
    if (entrant?.lit) {
      entrant.lit = false;
      this.emit({ type: 'extinguished', prisoner: entrant.id });
    }
    const targets = isolatedPrisoners(s).filter((id) => id !== entrant?.id);
    let target: number | null = targets[0] ?? null;
    if (targets.length > 1) {
      const a = (yield { kind: 'lightEaterTarget', prisoner: decider, cell, targets }) as Extract<
        Action,
        { type: 'lightEaterTarget' }
      >;
      target = a.prisoner;
    }
    this.emit({ type: 'lightEaten', cell, prisoner: target });
    if (target !== null) {
      const q = s.prisoners[target] as Prisoner;
      q.lit = false;
      this.emit({ type: 'extinguished', prisoner: q.id });
    }
    if (cell === null) return;
    if (entrant || litCells(s).has(cell)) this.flipToPit(cell, 'lightEater');
    else this.discardTileAt(cell, 'monster');
  }

  /** Перевернуть плитку ямой. Возвращает true, если клетка стала ямой сейчас. */
  private flipToPit(
    cell: Cell,
    cause: Extract<GameEvent, { type: 'pitOpened' }>['cause'],
  ): boolean {
    const bt = tileAt(this.state, cell);
    if (!bt || bt.pit) return false;
    bt.pit = true;
    this.pendingRemoval.delete(cell);
    this.emit({ type: 'pitOpened', cell, cause });
    return true;
  }

  /** Какие монстры видят клетки с узниками — до того, как поле изменится. */
  private seenSnapshot(cells: Cell[], exclude: Cell[]): Map<Cell, Cell[]> {
    const s = this.state;
    const out = new Map<Cell, Cell[]>();
    for (const c of cells) {
      if (prisonersAt(s, c).length === 0) continue;
      out.set(
        c,
        monstersSeeing(s, c).filter((m) => !exclude.includes(m)),
      );
    }
    return out;
  }

  /** Узники на клетках, ставших ямами, падают по порядку хода (падение провоцирует монстров). */
  private *dropPrisoners(cells: Cell[], seen: Map<Cell, Cell[]>): Gen {
    const s = this.state;
    for (const pi of turnOrderFrom(s, s.turn.active)) {
      const q = s.prisoners[pi] as Prisoner;
      if (q.cell === null || !cells.includes(q.cell) || !tileAt(s, q.cell)?.pit) continue;
      yield* this.startFall(q, q.cell, seen.get(q.cell) ?? []);
    }
  }

  // ───────────────────────── свет ─────────────────────────

  /** Шаг «Свет и тьма» (docs/spec/01-rules.md §4). */
  private *lightAndDark(): Gen {
    const s = this.state;
    this.discardUnlit();
    const decider = this.active();
    for (const pi of turnOrderFrom(s, s.turn.active)) {
      const q = s.prisoners[pi] as Prisoner;
      if (q.cell !== null && q.lit) yield* this.fillFor(q, decider.id, 'light');
    }
    this.discardUnlit();
    this.checkLoss();
  }

  /** Заполнить пустые клетки, освещённые выходами узника q. */
  private *fillFor(q: Prisoner, decider: number, reason: 'light' | 'setup'): Gen {
    const s = this.state;
    for (;;) {
      if (q.cell === null || !q.lit || s.pile.length === 0) return;
      const targets = uniqueCells(cellsLitBy(s, q)).filter((c) => c !== q.cell && !tileAt(s, c));
      if (targets.length === 0) return;
      const tile = this.drawForPlacement();
      if (tile === null) return;
      const def = kindDef(s, tile);
      const options: PlacementOption[] = targets.map((cell) => {
        const back = dirsLighting(s, q, cell).map(opposite);
        const rotations =
          def.monster === 'keyKeeper'
            ? [keeperRotFacing(back[0] ?? 0)]
            : rotationsWithExit(def, back);
        return { cell, rotations };
      });
      const a = (yield {
        kind: 'placeTile',
        prisoner: decider,
        tile,
        reason: s.tiles[tile] === 'herald' ? 'herald' : reason,
        options,
      }) as Extract<Action, { type: 'placeTile' }>;
      yield* this.placeAndTrigger(a.cell, tile, a.rot, decider, null);
    }
  }

  private discardUnlit(): void {
    const s = this.state;
    const lit = litCells(s);
    const mourner: Cell[] = [];
    s.board.forEach((bt, c) => {
      if (!bt) return;
      if (isMournerPit(bt)) {
        mourner.push(c);
        return;
      }
      if (lit.has(c)) return;
      if (!bt.pit && monsterAt(s, c) === 'keyKeeper') return;
      this.discardTileAt(c, 'unlit');
    });
    // Яма Плакальщика исчезает целиком, когда ни одна её клетка не освещена.
    if (mourner.length > 0 && !mourner.some((c) => lit.has(c))) {
      for (const c of mourner) s.board[c] = null;
      this.emit({ type: 'mournerPitRemoved', cells: mourner });
    }
    if (s.phase === 'play') this.checkLoss();
  }

  private relight(): void {
    const s = this.state;
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of s.prisoners) {
        if (q.lit || q.cell === null) continue;
        const near = DIRS.some((d) => {
          if (!connected(s, q.cell as Cell, d)) return false;
          const n = neighbor(s.size, q.cell as Cell, d);
          return prisonersAt(s, n).some((o) => o.lit);
        });
        if (near) {
          q.lit = true;
          changed = true;
          this.emit({ type: 'relit', prisoner: q.id });
        }
      }
    }
  }

  // ───────────────────────── ключи и решимость ─────────────────────────

  private pickKey(p: Prisoner, cell: Cell): void {
    const bt = tileAt(this.state, cell);
    if (!bt || bt.pit || p.hasKey || bt.keyTaken) return;
    if (this.state.tiles[bt.tile] !== 'key') return;
    bt.keyTaken = true;
    p.hasKey = true;
    this.emit({ type: 'keyTaken', prisoner: p.id, cell });
  }

  private giveKey(from: number, to: number): void {
    const s = this.state;
    const a = s.prisoners[from] as Prisoner;
    const b = s.prisoners[to] as Prisoner;
    a.hasKey = false;
    b.hasKey = true;
    this.emit({ type: 'keyGiven', from, to });
    const active = this.active();
    if (from === active.id && s.turn.keyAtStart && active.cell !== null) {
      s.turn.keyAtStart = false;
      this.pickKey(active, active.cell);
    }
    this.checkVictory();
  }

  private spendResolve(
    p: Prisoner,
    n: number,
    purpose: Extract<GameEvent, { type: 'resolveSpent' }>['purpose'],
  ): void {
    p.resolve = Math.max(0, p.resolve - n);
    this.emit({ type: 'resolveSpent', prisoner: p.id, purpose });
  }

  // ───────────────────────── плитки ─────────────────────────

  private draw(): number | null {
    const s = this.state;
    const tile = s.pile.pop();
    if (tile === undefined) return null;
    this.emit({ type: 'tileDrawn', tile, kind: s.tiles[tile] as TileKind });
    return tile;
  }

  private place(cell: Cell, tile: number, rot: Rot, prisoner: number): void {
    const s = this.state;
    s.board[cell] = { tile, rot, pit: false };
    s.stats.tilesPlaced += 1;
    this.emit({ type: 'tilePlaced', cell, tile, rot, prisoner });
  }

  private discardTileAt(cell: Cell, reason: DiscardReason): void {
    const s = this.state;
    const bt = tileAt(s, cell);
    if (!bt) return;
    s.board[cell] = null;
    if (isMournerPit(bt)) return;
    s.discard.push(bt.tile);
    this.pendingRemoval.delete(cell);
    this.emit({ type: 'tileDiscarded', cell, tile: bt.tile, reason });
  }

  private discardFromPile(n: number, prisoner: number | null): void {
    const s = this.state;
    const out: number[] = [];
    while (out.length < n) {
      const t = s.pile.pop();
      if (t === undefined) break;
      if (s.tiles[t] === 'herald') {
        // Предвестник не сгорает: его откладывают, вместо него уходит следующая плитка.
        if (this.revealHerald(t) === 'mourner') {
          // До выкладки он лежит рядом с полем.
          s.aside.push(t);
          this.heraldQueue.push({ tile: t, prisoner });
        }
        continue;
      }
      out.push(t);
      s.discard.push(t);
    }
    s.stats.pileDiscarded += out.length;
    if (out.length > 0) this.emit({ type: 'pileDiscarded', tiles: out, prisoner });
  }

  // ───────────────────────── конец игры ─────────────────────────

  private checkVictory(): void {
    const s = this.state;
    const first = s.prisoners[0]?.cell;
    if (first === null || first === undefined) return;
    if (!isGate(s, first)) return;
    if (s.prisoners.every((p) => p.cell === first && p.hasKey)) this.win();
  }

  /** Условия гарантированного поражения (docs/spec/01-rules.md §10.2). */
  private checkLoss(): void {
    const reason = lossReason(this.state);
    if (reason) this.lose(reason);
  }

  private win(): never {
    this.state.phase = 'won';
    this.emit({ type: 'won' });
    throw new GameOver();
  }

  private lose(reason: LossReason): never {
    this.state.phase = 'lost';
    this.state.lossReason = reason;
    this.emit({ type: 'lost', reason });
    throw new GameOver();
  }
}

/** Источники ключей: невзятые ключи на поле, хранители и такие же плитки в запасе. */
export function keysAvailable(state: GameState): number {
  let n = 0;
  state.board.forEach((bt) => {
    if (!bt || bt.pit || bt.keyTaken) return;
    const kind = state.tiles[bt.tile];
    if (kind === 'key' || kind === 'keyKeeper') n += 1;
  });
  for (const t of state.pile) {
    const kind = state.tiles[t];
    if (kind === 'key' || kind === 'keyKeeper') n += 1;
  }
  return n;
}

export function lossReason(state: GameState): LossReason | null {
  const gatesOnBoard = state.board.filter(
    (bt) => bt && !bt.pit && state.tiles[bt.tile] === 'gate',
  ).length;
  const gatesInPile = state.pile.filter((t) => state.tiles[t] === 'gate').length;
  if (gatesOnBoard + gatesInPile === 0) return 'noGates';
  const keyless = state.prisoners.filter((p) => !p.hasKey).length;
  if (keyless > keysAvailable(state)) return 'noKeys';
  if (state.lastFlicker) {
    if (state.prisoners.some((p) => p.cell === null)) return 'fellNoTiles';
    const gates = state.board.flatMap((bt, c) =>
      bt && !bt.pit && state.tiles[bt.tile] === 'gate' ? [c] : [],
    );
    const reach = state.prisoners.map((p) => reachable(state, p.cell as Cell));
    if (!gates.some((g) => reach.every((r) => r.has(g)))) return 'cutOff';
    const keyCells = state.board.flatMap((bt, c) => {
      if (!bt || bt.pit || bt.keyTaken) return [];
      const kind = state.tiles[bt.tile];
      return kind === 'key' || kind === 'keyKeeper' ? [c] : [];
    });
    const stuck = state.prisoners.some(
      (p, i) => !p.hasKey && !keyCells.some((k) => (reach[i] as Set<Cell>).has(k)),
    );
    if (stuck) return 'cutOff';
  }
  return null;
}
