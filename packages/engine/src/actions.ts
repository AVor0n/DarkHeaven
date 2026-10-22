import type { Action, Decision, Rot } from './types';

/** Все допустимые действия для решения (для ботов, тестов и простых интерфейсов). */
export function listActions(d: Decision): Action[] {
  switch (d.kind) {
    case 'placeStart':
      return d.cells.flatMap((cell) =>
        ([0, 1, 2, 3] as Rot[]).map((rot) => ({ type: 'placeStart', cell, rot }) as const),
      );
    case 'action': {
      const out: Action[] = d.moves.map((m) => ({ type: 'move', dir: m.dir }));
      if (d.stay) out.push({ type: 'stay' });
      for (const t of d.transfers) out.push({ type: 'giveKey', from: t.from, to: t.to });
      if (d.canEnd) out.push({ type: 'endTurn' });
      return out;
    }
    case 'placeTile':
      return d.options.flatMap((o) =>
        o.rotations.map((rot) => ({ type: 'placeTile', cell: o.cell, rot }) as const),
      );
    case 'dodge':
      return [
        { type: 'dodge', use: true },
        { type: 'dodge', use: false },
      ];
    case 'fallLine':
      return d.options.map((_, index) => ({ type: 'fallLine', index }));
    case 'landingCell':
      return d.cells.map((cell) => ({ type: 'landingCell', cell }));
    case 'forcedMove':
      return d.moves.map((m) => ({ type: 'move', dir: m.dir }));
    case 'flickerDiscard': {
      const out: Action[] = d.cells.map((cell) => ({ type: 'flickerDiscard', cell }));
      if (d.canKeepFlame) out.push({ type: 'keepFlame' });
      return out;
    }
    case 'mournerPlacement':
      return d.origins.map((origin) => ({ type: 'mournerPlacement', origin }));
    case 'lightEaterTarget':
      return d.targets.map((prisoner) => ({ type: 'lightEaterTarget', prisoner }));
  }
}
