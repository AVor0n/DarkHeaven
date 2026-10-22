import {
  computeChain,
  connected,
  DIRS,
  keeperTop,
  kindDef,
  monsterAt,
  monstersSeeing,
  neighbor,
  prisonersAt,
  tileAt,
  uniqueCells,
} from './board';
import type { Cell, GameState, MoveOption, Prisoner } from './types';

/** Глубокая копия состояния (оно целиком сериализуется в JSON). */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export interface PreviewHit {
  prisoner: number;
  monsterCell: Cell;
  /** Сколько плиток уйдёт из запаса без уклонения. */
  amount: number;
  dodgeable: boolean;
  /** Прерыватель пути: плитка под узником провалится, узник упадёт. */
  drops?: boolean;
}

export interface MovePreview {
  /** Покинутая плитка станет ямой. */
  crumbles: Cell | null;
  /** Узник упадёт (прыжок в яму или обрушение при «остаться»). */
  falls: boolean;
  /** Ход ведёт в пустую клетку: какая плитка выпадет, неизвестно. */
  unknownTile: boolean;
  /** После атаки монстра на своей клетке придётся сразу уйти. */
  forcedMove: boolean;
  attacks: { monsterCell: Cell; area: Cell[] }[];
  hits: PreviewHit[];
  pileLoss: number;
  pileAfter: number;
  keyPickup: boolean;
  extinguishes: number[];
  relights: number[];
  /** Решимость, которую узник получит («остаться»). */
  gainsResolve: boolean;
  /** Сколько плиток узник вытянет «вслепую» («остаться»). */
  draws: number;
}

function emptyPreview(state: GameState): MovePreview {
  return {
    crumbles: null,
    falls: false,
    unknownTile: false,
    forcedMove: false,
    attacks: [],
    hits: [],
    pileLoss: 0,
    pileAfter: state.pile.length,
    keyPickup: false,
    extinguishes: [],
    relights: [],
    gainsResolve: false,
    draws: 0,
  };
}

function fillAttacks(s: GameState, provoked: Cell[], out: MovePreview): void {
  const valid = uniqueCells(provoked).filter((c) => monsterAt(s, c));
  if (valid.length === 0) return;
  const chain = computeChain(s, valid);
  out.attacks = chain.monsters.map((m) => ({ monsterCell: m, area: chain.areas.get(m) ?? [] }));
  for (const h of chain.hits) {
    const q = s.prisoners[h.prisoner] as Prisoner;
    const kind = monsterAt(s, h.monsterCell);
    let amount = 3;
    let dodgeable = true;
    if (kind === 'pathBreaker') {
      const onIt = q.cell === h.monsterCell;
      out.hits.push({
        prisoner: h.prisoner,
        monsterCell: h.monsterCell,
        amount: onIt ? 3 : 0,
        dodgeable: onIt,
        drops: true,
      });
      continue;
    }
    if (kind === 'keyKeeper' && q.cell !== h.monsterCell) {
      amount = 1;
      dodgeable = false;
    } else if (kind === 'inevitable') {
      amount = 5;
      dodgeable = false;
    }
    out.hits.push({ prisoner: h.prisoner, monsterCell: h.monsterCell, amount, dodgeable });
    if (q.lit && !out.extinguishes.includes(q.id)) out.extinguishes.push(q.id);
  }
  out.pileLoss = out.hits.reduce((sum, h) => sum + h.amount, 0);
  out.pileAfter = Math.max(0, s.pile.length - out.pileLoss);
}

function computeRelights(s: GameState, out: MovePreview): void {
  for (const id of out.extinguishes) (s.prisoners[id] as Prisoner).lit = false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of s.prisoners) {
      if (q.lit || q.cell === null) continue;
      const near = DIRS.some(
        (d) =>
          connected(s, q.cell as Cell, d) &&
          prisonersAt(s, neighbor(s.size, q.cell as Cell, d)).some((o) => o.lit),
      );
      if (near) {
        q.lit = true;
        changed = true;
        if (!out.relights.includes(q.id)) out.relights.push(q.id);
      }
    }
  }
}

/** Последствия перемещения без раскрытия запаса (docs/spec/04-architecture.md §3.2). */
export function previewMove(state: GameState, prisoner: number, move: MoveOption): MovePreview {
  const s = cloneState(state);
  const out = emptyPreview(s);
  const p = s.prisoners[prisoner] as Prisoner;
  if (p.cell === null) return out;
  const from = p.cell;
  const to = move.to;
  const seenBefore = monstersSeeing(s, from);
  const left = tileAt(s, from);
  if (left && !left.pit && kindDef(s, left.tile).crumbling && prisonersAt(s, from).length === 1) {
    out.crumbles = from;
  }
  const dest = tileAt(s, to);
  p.cell = to;
  if (!dest) {
    out.unknownTile = true;
    fillAttacks(s, seenBefore, out);
    return out;
  }
  if (dest.pit) {
    out.falls = true;
    p.cell = null;
    fillAttacks(s, seenBefore, out);
    return out;
  }
  const bt = tileAt(s, to);
  if (bt && !bt.keyTaken && !p.hasKey) {
    const kind = s.tiles[bt.tile];
    out.keyPickup = kind === 'key' || kind === 'keyKeeper';
  }
  const monster = monsterAt(s, to);
  let provoked = [...seenBefore, ...monstersSeeing(s, to)];
  if (monster === 'keyKeeper') {
    const safe = bt !== null && neighbor(s.size, to, keeperTop(bt.rot)) === from;
    provoked = safe ? provoked.filter((c) => c !== to) : [to, ...provoked];
    out.forcedMove = true;
  } else if (monster) {
    provoked = [to, ...provoked];
    out.forcedMove = true;
  }
  fillAttacks(s, provoked, out);
  computeRelights(s, out);
  return out;
}

/** Последствия «остаться на месте». */
export function previewStay(
  state: GameState,
  prisoner: number,
  mode: 'normal' | 'resolve' | 'forced',
): MovePreview {
  const s = cloneState(state);
  const out = emptyPreview(s);
  const p = s.prisoners[prisoner] as Prisoner;
  if (p.cell === null) return out;
  if (mode === 'normal') {
    out.gainsResolve = p.resolve < 2;
    out.draws = s.pile.length > 0 ? 1 : 0;
    out.pileAfter = Math.max(0, s.pile.length - out.draws);
  }
  const bt = tileAt(s, p.cell);
  if (bt && !bt.pit && kindDef(s, bt.tile).crumbling) {
    out.crumbles = p.cell;
    out.falls = true;
    const seen = monstersSeeing(s, p.cell);
    p.cell = null;
    const pileBefore = out.pileAfter;
    fillAttacks(s, seen, out);
    out.pileAfter = Math.max(0, pileBefore - out.pileLoss);
  }
  return out;
}
