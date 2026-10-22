import type { GameState, MoveOption, MovePreview, TileKind } from '@darkheaven/engine';
import { capitalize, cellName, plural, prisonerName, TILE_NAMES } from '../i18n/ru';

export interface PreviewLine {
  tone: 'bad' | 'good' | 'info';
  text: string;
}

/** Человеческое описание последствий хода для панели действий. */
export function describePreview(
  view: GameState,
  pv: MovePreview,
  move?: MoveOption,
): PreviewLine[] {
  const out: PreviewLine[] = [];
  const pn = (id: number) => prisonerName(view, id);
  const cn = (c: number) => cellName(view.size, c);
  if (move && move.cost > 0) {
    out.push({ tone: 'info', text: `Стоит ${move.cost} решимости.` });
  }
  if (move?.kind === 'dash') {
    out.push({
      tone: 'bad',
      text: 'Рывок: монстр атакует, затем придётся сразу уйти с его клетки.',
    });
  }
  if (pv.unknownTile) out.push({ tone: 'info', text: 'Вы вытянете неизвестную плитку из запаса.' });
  if (pv.gainsResolve) out.push({ tone: 'good', text: '+1 решимость.' });
  if (pv.draws > 0) {
    out.push({
      tone: 'info',
      text: 'Тянете плитку: монстр заменит соседнюю плитку, остальное — в сброс.',
    });
  }
  if (pv.keyPickup) out.push({ tone: 'good', text: 'Подберёте ключ.' });
  if (pv.crumbles !== null)
    out.push({ tone: 'bad', text: `Проход в ${cn(pv.crumbles)} обрушится в яму.` });
  if (pv.falls) out.push({ tone: 'bad', text: 'Узник упадёт во тьму, и ход закончится.' });
  for (const a of pv.attacks) {
    const kind = view.board[a.monsterCell];
    const name = kind ? TILE_NAMES[view.tiles[kind.tile] as TileKind] : 'монстр';
    const hits = pv.hits.filter((h) => h.monsterCell === a.monsterCell);
    const who = hits.length
      ? hits
          .map((h) => {
            const loss = h.amount > 0 ? ` −${h.amount}${h.dodgeable ? ' (можно −2)' : ''}` : '';
            return `${pn(h.prisoner)}${loss}${h.drops ? ' и падает' : ''}`;
          })
          .join(', ')
      : 'никого не заденет';
    out.push({ tone: 'bad', text: `${capitalize(name)} в ${cn(a.monsterCell)} атакует: ${who}.` });
    if (kind && view.tiles[kind.tile] === 'pathBreaker') {
      out.push({ tone: 'bad', text: 'Весь ряд под ударом прерывателя провалится в ямы.' });
    }
  }
  if (pv.pileLoss > 0) {
    out.push({
      tone: 'bad',
      text: `Запас: ${view.pile.length} → ${pv.pileAfter} (−${pv.pileLoss} ${plural(pv.pileLoss, 'плитка', 'плитки', 'плиток')}).`,
    });
  }
  if (pv.forcedMove)
    out.push({ tone: 'bad', text: 'После атаки придётся сразу уйти с клетки монстра.' });
  if (pv.extinguishes.length) {
    out.push({ tone: 'bad', text: `Погаснет свеча: ${pv.extinguishes.map(pn).join(', ')}.` });
  }
  if (pv.relights.length) {
    out.push({ tone: 'good', text: `Вновь загорится: ${pv.relights.map(pn).join(', ')}.` });
  }
  if (!out.length) out.push({ tone: 'good', text: 'Безопасно: монстры не заметят.' });
  return out;
}
