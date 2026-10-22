import type { Action, Decision } from './types';

/** Проверить, что действие допустимо для текущего решения. Возвращает текст ошибки или null. */
export function validateAction(d: Decision, a: Action): string | null {
  switch (d.kind) {
    case 'placeStart':
      if (a.type !== 'placeStart') return 'Ожидается выбор стартовой клетки';
      if (!d.cells.includes(a.cell)) return 'Клетка занята';
      return isRot(a.rot) ? null : 'Неверный поворот';
    case 'action':
      switch (a.type) {
        case 'move':
          return d.moves.some((m) => m.dir === a.dir) ? null : 'Туда идти нельзя';
        case 'stay':
          return d.stay ? null : 'Сейчас нельзя остаться на месте';
        case 'giveKey':
          return d.transfers.some((t) => t.from === a.from && t.to === a.to)
            ? null
            : 'Передать ключ нельзя';
        case 'endTurn':
          return d.canEnd ? null : 'Сначала нужно сделать ход';
        default:
          return 'Ожидается ход узника';
      }
    case 'placeTile':
    case 'forcedMove':
      if (d.kind === 'forcedMove') {
        if (a.type !== 'move') return 'Ожидается вынужденное перемещение';
        return d.moves.some((m) => m.dir === a.dir) ? null : 'Туда идти нельзя';
      }
      if (a.type !== 'placeTile') return 'Ожидается выкладка плитки';
      return d.options.some((o) => o.cell === a.cell && o.rotations.includes(a.rot))
        ? null
        : 'Плитку нельзя так положить';
    case 'dodge':
      return a.type === 'dodge' ? null : 'Ожидается решение об уклонении';
    case 'fallLine':
      if (a.type !== 'fallLine') return 'Ожидается выбор линии падения';
      return a.index >= 0 && a.index < d.options.length ? null : 'Неверная линия';
    case 'landingCell':
      if (a.type !== 'landingCell') return 'Ожидается клетка приземления';
      return d.cells.includes(a.cell) ? null : 'Сюда приземлиться нельзя';
    case 'flickerDiscard':
      if (a.type === 'keepFlame') return d.canKeepFlame ? null : 'Нет решимости';
      if (a.type !== 'flickerDiscard') return 'Ожидается сброс плитки';
      return d.cells.includes(a.cell) ? null : 'Эту плитку сбросить нельзя';
    case 'mournerPlacement':
      if (a.type !== 'mournerPlacement') return 'Ожидается позиция Плакальщика';
      return d.origins.includes(a.origin) ? null : 'Плакальщик сюда не помещается';
    case 'lightEaterTarget':
      if (a.type !== 'lightEaterTarget') return 'Ожидается цель пожирателя света';
      return d.targets.includes(a.prisoner) ? null : 'Эта цель недоступна';
  }
}

function isRot(r: number): boolean {
  return r === 0 || r === 1 || r === 2 || r === 3;
}
