import { ALL, TILE_KINDS, type TileKindDef } from './content';
import type { BoardTile, Cell, Dir, GameState, MonsterKind, Prisoner, Rot } from './types';

export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DIR_NAMES = ['N', 'E', 'S', 'W'] as const;

export function opposite(d: Dir): Dir {
  return ((d + 2) % 4) as Dir;
}

export function cellXY(size: number, cell: Cell): [number, number] {
  return [cell % size, Math.floor(cell / size)];
}

export function cellAt(size: number, x: number, y: number): Cell {
  const xx = ((x % size) + size) % size;
  const yy = ((y % size) + size) % size;
  return yy * size + xx;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Соседняя клетка с переносом через край поля. */
export function neighbor(size: number, cell: Cell, d: Dir): Cell {
  const [x, y] = cellXY(size, cell);
  return cellAt(size, x + (DX[d] as number), y + (DY[d] as number));
}

/** Соседняя клетка без переноса (null за краем). */
export function neighborNoWrap(size: number, cell: Cell, dx: number, dy: number): Cell | null {
  const [x, y] = cellXY(size, cell);
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= size || ny >= size) return null;
  return ny * size + nx;
}

/** Повернуть маску выходов по часовой стрелке на rot × 90°. */
export function rotateMask(mask: number, rot: Rot): number {
  let m = mask;
  for (let i = 0; i < rot; i++) m = ((m << 1) | (m >> 3)) & ALL;
  return m;
}

export function maskHas(mask: number, d: Dir): boolean {
  return (mask & (1 << d)) !== 0;
}

export function kindDef(state: GameState, tile: number): TileKindDef {
  const kind = state.tiles[tile];
  if (!kind) throw new Error(`Неизвестная плитка ${tile}`);
  return TILE_KINDS[kind];
}

export function tileAt(state: GameState, cell: Cell): BoardTile | null {
  return state.board[cell] ?? null;
}

/** Выходы плитки в клетке с учётом поворота; у ямы выходы во все стороны. */
export function exitsAt(state: GameState, cell: Cell): number {
  const bt = tileAt(state, cell);
  if (!bt) return 0;
  if (bt.pit) return ALL;
  return rotateMask(kindDef(state, bt.tile).exits, bt.rot);
}

export function hasExit(state: GameState, cell: Cell, d: Dir): boolean {
  return maskHas(exitsAt(state, cell), d);
}

/** Клетки соединены проходом в направлении d. */
export function connected(state: GameState, cell: Cell, d: Dir): boolean {
  const other = neighbor(state.size, cell, d);
  return (
    tileAt(state, cell) !== null &&
    tileAt(state, other) !== null &&
    hasExit(state, cell, d) &&
    hasExit(state, other, opposite(d))
  );
}

/** Монстр в клетке (лицом вверх), иначе null. */
export function monsterAt(state: GameState, cell: Cell): MonsterKind | null {
  const bt = tileAt(state, cell);
  if (!bt || bt.pit) return null;
  return kindDef(state, bt.tile).monster ?? null;
}

export function isGate(state: GameState, cell: Cell): boolean {
  const bt = tileAt(state, cell);
  return !!bt && !bt.pit && !!kindDef(state, bt.tile).gate;
}

export function isPit(state: GameState, cell: Cell): boolean {
  return !!tileAt(state, cell)?.pit;
}

export function prisonersAt(state: GameState, cell: Cell): Prisoner[] {
  return state.prisoners.filter((p) => p.cell === cell);
}

export function onBoard(p: Prisoner): p is Prisoner & { cell: Cell } {
  return p.cell !== null;
}

/** Клетки, освещённые одним узником. */
export function cellsLitBy(state: GameState, p: Prisoner): Cell[] {
  if (p.cell === null) return [];
  const cells = [p.cell];
  if (p.lit) {
    for (const d of DIRS) {
      if (hasExit(state, p.cell, d)) cells.push(neighbor(state.size, p.cell, d));
    }
  }
  return cells;
}

/** Направления выходов узника, ведущие в клетку target. */
export function dirsLighting(state: GameState, p: Prisoner, target: Cell): Dir[] {
  if (p.cell === null || !p.lit) return [];
  return DIRS.filter(
    (d) => hasExit(state, p.cell as Cell, d) && neighbor(state.size, p.cell as Cell, d) === target,
  );
}

export function litCells(state: GameState): Set<Cell> {
  const lit = new Set<Cell>();
  for (const p of state.prisoners) for (const c of cellsLitBy(state, p)) lit.add(c);
  return lit;
}

/** Направление «верха» хранителя ключа (напротив рта). Рот в повороте 0 смотрит на юг. */
export function keeperTop(rot: Rot): Dir {
  return rot as number as Dir;
}

/** Направления линии видимости монстра. */
export function sightDirs(state: GameState, cell: Cell): Dir[] {
  const bt = tileAt(state, cell);
  const monster = monsterAt(state, cell);
  if (!bt || !monster) return [];
  switch (monster) {
    case 'waxEater':
    case 'inevitable':
      return [...DIRS];
    case 'keyKeeper':
      return DIRS.filter((d) => d !== keeperTop(bt.rot));
    case 'pathBreaker':
      return [bt.rot as number as Dir, opposite(bt.rot as number as Dir)];
    default:
      return [];
  }
}

export interface LineCell {
  cell: Cell;
  /** Направление, в котором линия шла от монстра. */
  dir: Dir;
}

/** Линия видимости монстра по соединённым проходам (docs/spec/01-rules.md §5.1). */
export function sightLine(state: GameState, monsterCell: Cell): LineCell[] {
  const out: LineCell[] = [];
  for (const d of sightDirs(state, monsterCell)) {
    let cur = monsterCell;
    for (let step = 0; step < state.size; step++) {
      if (!hasExit(state, cur, d)) break;
      const next = neighbor(state.size, cur, d);
      if (next === monsterCell) break;
      const bt = tileAt(state, next);
      if (!bt || bt.pit) break;
      if (!hasExit(state, next, opposite(d))) break;
      out.push({ cell: next, dir: d });
      cur = next;
    }
  }
  return out;
}

/** Зона атаки монстра. */
export function attackArea(state: GameState, monsterCell: Cell): LineCell[] {
  const monster = monsterAt(state, monsterCell);
  if (monster === 'inevitable') {
    const out: LineCell[] = [];
    for (const d of DIRS) {
      let cur = monsterCell;
      for (let step = 1; step < state.size; step++) {
        cur = neighbor(state.size, cur, d);
        out.push({ cell: cur, dir: d });
      }
    }
    return out;
  }
  if (monster === 'pathBreaker') {
    const bt = tileAt(state, monsterCell) as BoardTile;
    const d = bt.rot as number as Dir;
    const out: LineCell[] = [];
    let cur = monsterCell;
    for (let step = 1; step < state.size; step++) {
      cur = neighbor(state.size, cur, d);
      out.push({ cell: cur, dir: d });
    }
    return out;
  }
  return sightLine(state, monsterCell);
}

/** Монстры, в линии видимости которых находится клетка. */
export function monstersSeeing(state: GameState, cell: Cell): Cell[] {
  const out: Cell[] = [];
  state.board.forEach((bt, c) => {
    if (!bt || bt.pit || c === cell) return;
    if (sightDirs(state, c).length === 0) return;
    if (sightLine(state, c).some((lc) => lc.cell === cell)) out.push(c);
  });
  return out;
}

export function uniqueCells(cells: Iterable<Cell>): Cell[] {
  return [...new Set(cells)];
}

export interface ChainHit {
  monsterCell: Cell;
  prisoner: number;
}

export interface AttackChain {
  /** Атакующие монстры в порядке активации. */
  monsters: Cell[];
  areas: Map<Cell, Cell[]>;
  hits: ChainHit[];
}

/** Порядок узников начиная с активного. */
export function turnOrderFrom(state: GameState, start: number): number[] {
  const n = state.prisoners.length;
  return Array.from({ length: n }, (_, i) => (start + i) % n);
}

/**
 * Цепочка атак по одному снимку поля (трактовка T4): спровоцированные монстры
 * и монстры, задетые их атаками, затем попадания по узникам.
 */
export function computeChain(
  state: GameState,
  provoked: Cell[],
  inert: ReadonlySet<Cell> = new Set(),
): AttackChain {
  const monsters: Cell[] = [];
  const areas = new Map<Cell, Cell[]>();
  const queue = provoked.filter((c) => !inert.has(c));
  const seen = new Set<Cell>(inert);
  while (queue.length > 0) {
    const m = queue.shift() as Cell;
    if (seen.has(m)) continue;
    const kind = monsterAt(state, m);
    if (!kind || sightDirs(state, m).length === 0) continue;
    seen.add(m);
    monsters.push(m);
    const area = attackArea(state, m);
    areas.set(m, uniqueCells(area.map((lc) => lc.cell)));
    for (const lc of area) {
      if (seen.has(lc.cell) || queue.includes(lc.cell)) continue;
      const other = monsterAt(state, lc.cell);
      if (!other || sightDirs(state, lc.cell).length === 0) continue;
      if (other === 'keyKeeper') {
        const bt = tileAt(state, lc.cell) as BoardTile;
        // Атака пришла в хранителя со стороны его «верха» — цепной реакции нет.
        const enteredFrom = opposite(lc.dir);
        const fromNonTop = area.some(
          (x) => x.cell === lc.cell && opposite(x.dir) !== keeperTop(bt.rot),
        );
        if (enteredFrom === keeperTop(bt.rot) && !fromNonTop) continue;
      }
      queue.push(lc.cell);
    }
  }
  const hits: ChainHit[] = [];
  const order = turnOrderFrom(state, state.turn.active);
  for (const m of monsters) {
    const area = new Set(areas.get(m));
    area.add(m);
    for (const pi of order) {
      const p = state.prisoners[pi] as Prisoner;
      if (p.cell !== null && area.has(p.cell)) hits.push({ monsterCell: m, prisoner: pi });
    }
  }
  return { monsters, areas, hits };
}

/** Повороты плитки, при которых у неё есть выход хотя бы в одно из направлений need. */
export function rotationsWithExit(def: TileKindDef, need: Dir[]): Rot[] {
  const rots: Rot[] = [];
  for (const r of [0, 1, 2, 3] as Rot[]) {
    const m = rotateMask(def.exits, r);
    if (need.length === 0 || need.some((d) => maskHas(m, d))) rots.push(r);
  }
  return rots;
}

/** Поворот хранителя, при котором рот смотрит в направлении d (рот в повороте 0 — юг). */
export function keeperRotFacing(d: Dir): Rot {
  return ((d + 2) % 4) as Rot;
}

/**
 * Достижимость по соединённым плиткам (без ям). Монстров можно пройти рывком.
 * Используется для проверки отрезанности от врат в последнем мерцании.
 */
export function reachable(state: GameState, from: Cell): Set<Cell> {
  const seen = new Set<Cell>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const c = queue.shift() as Cell;
    for (const d of DIRS) {
      if (!connected(state, c, d)) continue;
      const n = neighbor(state.size, c, d);
      if (seen.has(n) || isPit(state, n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}
