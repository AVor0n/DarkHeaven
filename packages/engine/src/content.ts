import type { GameConfig, MonsterKind, TileKind } from './types';

/** Битовые маски выходов в повороте 0. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const ALL = N | E | S | W;

export interface TileKindDef {
  kind: TileKind;
  /** Выходы в повороте 0. */
  exits: number;
  crumbling: boolean;
  monster?: MonsterKind;
  /** На плитке может стоять несколько узников. */
  multi?: boolean;
  key?: boolean;
  gate?: boolean;
}

export const TILE_KINDS: Record<TileKind, TileKindDef> = {
  start: { kind: 'start', exits: E | S, crumbling: true },
  straight: { kind: 'straight', exits: N | S, crumbling: true },
  t: { kind: 't', exits: E | S | W, crumbling: false },
  crumblingT: { kind: 'crumblingT', exits: E | S | W, crumbling: true },
  cross: { kind: 'cross', exits: ALL, crumbling: false },
  key: { kind: 'key', exits: ALL, crumbling: true, key: true },
  gate: { kind: 'gate', exits: ALL, crumbling: false, multi: true, gate: true },
  waxEater: { kind: 'waxEater', exits: ALL, crumbling: false, monster: 'waxEater' },
  // «Рот» хранителя в повороте 0 смотрит на юг, «верх» — север.
  keyKeeper: { kind: 'keyKeeper', exits: ALL, crumbling: false, monster: 'keyKeeper', key: true },
  darkSpawn: { kind: 'darkSpawn', exits: ALL, crumbling: false, monster: 'darkSpawn' },
  herald: { kind: 'herald', exits: ALL, crumbling: false, monster: 'herald' },
  inevitable: { kind: 'inevitable', exits: ALL, crumbling: false, monster: 'inevitable' },
  lightEater: { kind: 'lightEater', exits: ALL, crumbling: false, monster: 'lightEater' },
  // Лица прерывателя пути смотрят на север и юг.
  pathBreaker: { kind: 'pathBreaker', exits: N | S, crumbling: false, monster: 'pathBreaker' },
};

/** Сколько плиток каждого вида есть в коробке (с дополнением). */
export const BOX: Record<TileKind, number> = {
  start: 5,
  straight: 10,
  t: 30,
  crumblingT: 2,
  cross: 12,
  key: 8,
  gate: 4,
  waxEater: 13,
  keyKeeper: 7,
  darkSpawn: 3,
  herald: 5,
  inevitable: 3,
  lightEater: 4,
  pathBreaker: 2,
};

export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple'] as const;

export interface SetupPlan {
  size: number;
  prisoners: number;
  /** Состав основной части запаса (без начального окружения). */
  pile: Partial<Record<TileKind, number>>;
  /** Начальное окружение, кладётся на верх запаса. */
  initial: Partial<Record<TileKind, number>>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Состав партии по конфигурации (см. docs/spec/01-rules.md §3 и 02-extended-rules.md). */
export function setupPlan(config: GameConfig): SetupPlan {
  const five = config.players >= 5;
  const size = five ? 7 : 6;
  const prisoners = five ? 5 : 4;
  const initial: Partial<Record<TileKind, number>> = five
    ? { t: 5, cross: 3, straight: 2 }
    : { t: 4, cross: 2, straight: 2 };

  const chaos = config.difficulty?.chaos ?? false;
  let keys = clamp((five ? 7 : 6) + (config.difficulty?.keyDelta ?? 0), 1, BOX.key);
  let waxEaters = five ? 10 : 12;
  let keepers = 0;
  let spawns = 0;
  if (config.advanced) {
    keys = 0;
    waxEaters = 4;
    keepers = clamp((five ? 7 : 6) + (config.difficulty?.keyDelta ?? 0), 1, BOX.keyKeeper);
    spawns = config.extraSpawn ? 3 : 2;
  }
  const lightEaters = clamp(config.lightEaters ?? 0, 0, BOX.lightEater);
  const pathBreakers = clamp(config.pathBreakers ?? 0, 0, BOX.pathBreaker);
  if (!config.expansionAddOnly) {
    waxEaters = Math.max(0, waxEaters - lightEaters - pathBreakers);
  }
  let heralds = 0;
  if (config.endBearer) heralds = 5;
  else if (config.mourner) heralds = 2;

  const tCount = BOX.t - (initial.t ?? 0) - (chaos ? 2 : 0);
  const pile: Partial<Record<TileKind, number>> = {
    straight: BOX.straight - (initial.straight ?? 0),
    t: tCount,
    cross: BOX.cross - (initial.cross ?? 0),
    key: keys,
    gate: config.difficulty?.removeGate ? 3 : 4,
    waxEater: waxEaters,
    crumblingT: chaos ? 2 : 0,
    keyKeeper: keepers,
    darkSpawn: spawns,
    inevitable: clamp(config.inevitables ?? 0, 0, BOX.inevitable),
    herald: heralds,
    lightEater: lightEaters,
    pathBreaker: pathBreakers,
  };
  return { size, prisoners, pile, initial };
}

/** Кто управляет каждым узником при данном числе игроков (docs/spec/01-rules.md §3.2). */
export function defaultControllers(players: number): number[] {
  switch (players) {
    case 1:
      return [0, 0, 0, 0];
    case 2:
      return [0, 0, 1, 1];
    case 3:
      return [0, 1, 2, 0];
    case 4:
      return [0, 1, 2, 3];
    default:
      return [0, 1, 2, 3, 4];
  }
}
