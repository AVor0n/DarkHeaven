import {
  type Action,
  attackArea,
  type Cell,
  cloneState,
  type Decision,
  type GameState,
  type MoveOption,
  monsterAt,
  type Rot,
  type TileKind,
} from '@darkheaven/engine';
import type { Ghost, TargetKind } from '../board/Board';

const ALL_ROTS: Rot[] = [0, 1, 2, 3];

/** Клетки, которые подсвечиваются для текущего решения. */
export function targetsFor(d: Decision | null): Map<Cell, TargetKind> {
  const out = new Map<Cell, TargetKind>();
  if (!d) return out;
  switch (d.kind) {
    case 'placeStart':
      for (const c of d.cells) out.set(c, 'start');
      break;
    case 'action':
    case 'forcedMove':
      for (const m of d.moves) out.set(m.to, moveTarget(m));
      break;
    case 'placeTile':
      for (const o of d.options) out.set(o.cell, 'place');
      break;
    case 'landingCell':
      for (const c of d.cells) out.set(c, 'land');
      break;
    case 'flickerDiscard':
      for (const c of d.cells) out.set(c, 'discard');
      break;
    case 'mournerPlacement':
      for (const c of d.origins) out.set(c, 'place');
      break;
    default:
      break;
  }
  return out;
}

function moveTarget(m: MoveOption): TargetKind {
  switch (m.kind) {
    case 'dash':
      return 'dash';
    case 'pit':
      return 'pit';
    case 'empty':
      return 'empty';
    case 'keeper':
      return 'keeper';
    default:
      return 'move';
  }
}

export function moveTo(d: Decision | null, cell: Cell | null): MoveOption | undefined {
  if (!d || cell === null || (d.kind !== 'action' && d.kind !== 'forcedMove')) return undefined;
  return d.moves.find((m) => m.to === cell);
}

/** Допустимые повороты плитки в выбранной клетке. */
export function rotationsFor(d: Decision | null, cell: Cell | null): Rot[] {
  if (!d || cell === null) return [];
  if (d.kind === 'placeStart') return d.cells.includes(cell) ? ALL_ROTS : [];
  if (d.kind === 'placeTile') return d.options.find((o) => o.cell === cell)?.rotations ?? [];
  return [];
}

/** Действие, которое подтверждает выбор клетки (null — клетку нужно сперва выбрать). */
export function confirmAction(
  d: Decision | null,
  cell: Cell | null,
  rot: Rot | null,
): Action | null {
  if (!d || cell === null) return null;
  switch (d.kind) {
    case 'placeStart':
      return d.cells.includes(cell) && rot !== null ? { type: 'placeStart', cell, rot } : null;
    case 'placeTile':
      return rot !== null && rotationsFor(d, cell).includes(rot)
        ? { type: 'placeTile', cell, rot }
        : null;
    case 'action':
    case 'forcedMove': {
      const m = moveTo(d, cell);
      return m ? { type: 'move', dir: m.dir } : null;
    }
    case 'landingCell':
      return d.cells.includes(cell) ? { type: 'landingCell', cell } : null;
    case 'flickerDiscard':
      return d.cells.includes(cell) ? { type: 'flickerDiscard', cell } : null;
    case 'mournerPlacement':
      return d.origins.includes(cell) ? { type: 'mournerPlacement', origin: cell } : null;
    default:
      return null;
  }
}

/** Выбор клетки сразу подтверждает решение (без шага «выбрать → Готово»). */
export function confirmsOnFirstClick(d: Decision | null): boolean {
  return d?.kind === 'landingCell' || d?.kind === 'flickerDiscard';
}

/** Какую плитку показать призраком в выбранной клетке. */
export function ghostFor(
  d: Decision | null,
  view: GameState,
  cell: Cell | null,
  rot: Rot | null,
): Ghost | null {
  if (!d || cell === null || rot === null) return null;
  if (d.kind === 'placeStart') {
    const p = view.prisoners[d.prisoner];
    return p ? { cell, kind: 'start', rot, seed: d.prisoner } : null;
  }
  if (d.kind === 'placeTile') {
    return { cell, kind: view.tiles[d.tile] as TileKind, rot, seed: d.tile };
  }
  return null;
}

/** Зона атаки монстра, если бы он лежал в клетке с данным поворотом. */
export function hypotheticalArea(view: GameState, ghost: Ghost, tile: number): Cell[] {
  const s = cloneState(view);
  s.board[ghost.cell] = { tile, rot: ghost.rot, pit: false };
  if (!monsterAt(s, ghost.cell)) return [];
  return attackArea(s, ghost.cell).map((l) => l.cell);
}

/** Зоны атаки всех монстров на поле (клавиша L). */
export function allAreas(view: GameState): Set<Cell> {
  const out = new Set<Cell>();
  for (let c = 0; c < view.board.length; c++) {
    if (!monsterAt(view, c)) continue;
    for (const l of attackArea(view, c)) out.add(l.cell);
  }
  return out;
}

export function areaOf(view: GameState, cell: Cell | null): Set<Cell> {
  if (cell === null || !monsterAt(view, cell)) return new Set();
  return new Set(attackArea(view, cell).map((l) => l.cell));
}
