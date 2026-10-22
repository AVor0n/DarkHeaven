import type { GameEvent, GameState, LossReason, PrisonerColor, TileKind } from '@darkheaven/engine';
import { cellXY } from '@darkheaven/engine';

export const PRISONER_NAMES: Record<PrisonerColor, string> = {
  red: 'Красный',
  yellow: 'Жёлтый',
  green: 'Зелёный',
  blue: 'Синий',
  purple: 'Фиолетовый',
};

export const PRISONER_LETTERS: Record<PrisonerColor, string> = {
  red: 'К',
  yellow: 'Ж',
  green: 'З',
  blue: 'С',
  purple: 'Ф',
};

export const TILE_NAMES: Record<TileKind, string> = {
  start: 'стартовый фрагмент',
  straight: 'прямой проход',
  t: 'Т-образный проход',
  crumblingT: 'разрушающийся Т-образный проход',
  cross: 'перекрёсток',
  key: 'фрагмент с ключом',
  gate: 'врата',
  waxEater: 'пожиратель воска',
  keyKeeper: 'хранитель ключа',
  darkSpawn: 'исчадие тьмы',
  herald: 'предвестник',
  inevitable: 'Неотвратимый',
  lightEater: 'пожиратель света',
  pathBreaker: 'прерыватель пути',
};

export const LOSS_REASONS: Record<LossReason, string> = {
  noGates: 'Тьма поглотила все врата — выхода больше нет.',
  noKeys: 'Ключей не хватит на всех узников.',
  fellNoTiles: 'Узник падал во тьму, а запас свечи иссяк. Он падает вечно.',
  flickerUnderPrisoner: 'Тьме больше нечего поглотить, кроме самих узников.',
  cutOff: 'Тьма отрезала узников от врат.',
  surrender: 'Узники сдались тьме.',
};

const DIR_WORDS = ['на север', 'на восток', 'на юг', 'на запад'];

const PIT_CAUSES: Record<
  Extract<GameEvent, { type: 'pitOpened' }>['cause'],
  (cell: string) => string
> = {
  spawn: (c) => `Исчадие тьмы: ${c} проваливается в яму.`,
  keeper: (c) => `Хранитель в ${c} рассыпался — на его месте яма.`,
  pathBreaker: (c) => `Прерыватель пути обрушил ${c}.`,
  lightEater: (c) => `Пожиратель света в ${c} уходит в яму.`,
};

export function cellName(size: number, cell: number): string {
  const [x, y] = cellXY(size, cell);
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function prisonerName(state: GameState, id: number): string {
  const p = state.prisoners[id];
  return p ? PRISONER_NAMES[p.color] : `Узник ${id + 1}`;
}

export function playerName(names: string[] | undefined, index: number): string {
  return names?.[index]?.trim() || `Игрок ${index + 1}`;
}

/** Строка журнала для события (null — событие не показывается в журнале). */
export function formatEvent(e: GameEvent, state: GameState): string | null {
  const pn = (id: number) => prisonerName(state, id);
  const cn = (c: number) => cellName(state.size, c);
  const tn = (tile: number) => TILE_NAMES[state.tiles[tile] as TileKind] ?? 'плитка';
  switch (e.type) {
    case 'turnStarted':
      return `— Ход ${e.turn}: ${pn(e.prisoner)} —`;
    case 'moved':
      return `${pn(e.prisoner)} ${e.forced ? 'вынужден уйти' : 'идёт'} ${DIR_WORDS[e.dir]} (${cn(e.to)}).`;
    case 'stayed':
      return `${pn(e.prisoner)} остаётся на месте.`;
    case 'tilePlaced':
      return null;
    case 'tileDrawn':
      return null;
    case 'tileDiscarded':
      if (e.reason === 'flicker')
        return `Последнее мерцание: тьма поглощает ${tn(e.tile)} в ${cn(e.cell)}.`;
      if (e.reason === 'monster') return `${capitalize(tn(e.tile))} исчезает после атаки.`;
      if (e.reason === 'replaced')
        return `${capitalize(tn(e.tile))} в ${cn(e.cell)} заменён монстром.`;
      if (state.tiles[e.tile] === 'gate') return `Тьма поглотила врата в ${cn(e.cell)}!`;
      if (state.tiles[e.tile] === 'key') return `Тьма поглотила ключ в ${cn(e.cell)}.`;
      return null;
    case 'pileDiscarded': {
      const list = e.tiles.map(tn).join(', ');
      return `Свеча тает: в сброс уходит ${e.tiles.length} ${plural(e.tiles.length, 'плитка', 'плитки', 'плиток')} (${list}).`;
    }
    case 'crumbled':
      return `Проход в ${cn(e.cell)} обрушился в яму.`;
    case 'pitOpened':
      return PIT_CAUSES[e.cause](cn(e.cell));
    case 'fell':
      return `${pn(e.prisoner)} падает во тьму!`;
    case 'fallLineChosen':
      return `${pn(e.prisoner)} приземлится ${e.line.axis === 'row' ? `в строке ${e.line.index + 1}` : `в столбце ${String.fromCharCode(65 + e.line.index)}`}.`;
    case 'landed':
      return `${pn(e.prisoner)} приземляется в ${cn(e.cell)}.`;
    case 'resolveGained':
      return `${pn(e.prisoner)} собирается с духом: +1 решимость.`;
    case 'resolveSpent': {
      const what: Record<typeof e.purpose, string> = {
        extraMove: 'на дополнительное перемещение',
        dodge: 'на уклонение',
        dash: 'на рывок',
        darkStay: 'чтобы остаться во тьме',
        keepFlame: 'на поддержание пламени',
      };
      return `${pn(e.prisoner)} тратит решимость ${what[e.purpose]}.`;
    }
    case 'attack': {
      const who = e.targets.length ? e.targets.map(pn).join(', ') : 'никого';
      return `${capitalize(tn(e.tile))} в ${cn(e.monsterCell)} атакует! Под удар попадает: ${who}.`;
    }
    case 'hit':
      return e.discard > 0
        ? `${pn(e.prisoner)}: −${e.discard} из запаса.`
        : `${pn(e.prisoner)}: пол уходит из-под ног.`;
    case 'lightEaten':
      return e.prisoner === null
        ? 'Пожиратель света не нашёл одинокой свечи.'
        : `Пожиратель света гасит одинокую свечу: ${pn(e.prisoner)}.`;
    case 'extinguished':
      return `Свеча узника ${pn(e.prisoner)} гаснет.`;
    case 'relit':
      return `${pn(e.prisoner)} вновь зажигает свечу.`;
    case 'keyTaken':
      return `${pn(e.prisoner)} подбирает ключ.`;
    case 'keyGiven':
      return `${pn(e.from)} передаёт ключ: ${pn(e.to)}.`;
    case 'heraldSetAside':
      return `Предвестник отложен (${e.count}).`;
    case 'mournerPlaced':
      return `Явился Плакальщик! Его тень накрыла ${cn(e.cells[0] ?? e.origin)}–${cn(e.cells[8] ?? e.origin)}.`;
    case 'mournerPitRemoved':
      return 'Яма Плакальщика растворилась во тьме.';
    case 'endBearerArrived':
      return 'Явился Несущий Конец: запас тает каждый ход.';
    case 'lastFlicker':
      return 'Запас иссяк. Начинается последнее мерцание.';
    case 'won':
      return 'Узники повернули ключи — врата открыты!';
    case 'lost':
      return LOSS_REASONS[e.reason];
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
