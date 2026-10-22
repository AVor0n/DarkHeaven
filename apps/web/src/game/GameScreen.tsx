import {
  type Action,
  type Cell,
  type Dir,
  type MovePreview,
  monsterAt,
  previewMove,
  previewStay,
  randomSeed,
  squareCells,
  type TileKind,
} from '@darkheaven/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playEvents } from '../audio/sound';
import { Board } from '../board/Board';
import { TileSvg } from '../board/Tile';
import { PRISONER_NAMES, playerName, TILE_NAMES } from '../i18n/ru';
import { SettingsPanel } from '../screens/SettingsPanel';
import { useGame } from '../store/game';
import { animMs, useSettings } from '../store/settings';
import { ActionBar } from './ActionBar';
import {
  allAreas,
  areaOf,
  confirmAction,
  confirmsOnFirstClick,
  ghostFor,
  hypotheticalArea,
  moveTo,
  rotationsFor,
  targetsFor,
} from './decisionUi';
import { downloadReplay, EndScreen } from './EndScreen';
import { PrisonersPanel } from './PrisonersPanel';
import { describePreview } from './previewText';
import { DiscardSummary, EventLog, PileCandle } from './SidePanel';

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

const EMPTY = new Set<number>();

/** Фокус на кнопку модального окна при его открытии. */
function focusOnMount(el: HTMLButtonElement | null) {
  el?.focus();
}

export function GameScreen({ onMenu }: { onMenu(): void }) {
  const { game, view, pending, events, batchStart, rev, error } = useGame();
  const apply = useGame((s) => s.apply);
  const newGame = useGame((s) => s.newGame);
  const settings = useSettings();
  const hardcore = settings.hints === 'hardcore';

  // Выбор клетки привязан к ревизии: новое решение сразу начинается с чистого листа.
  const [picked, setPicked] = useState({ rev: -1, cell: null as Cell | null, rotIdx: 0 });
  const [hover, setHover] = useState<Cell | null>(null);
  const [hoverStay, setHoverStay] = useState(false);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [flash, setFlash] = useState<Set<Cell>>(EMPTY);
  const [shake, setShake] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [surrender, setSurrender] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualFocus, setManualFocus] = useState<Cell | null>(null);

  // Единственную клетку выкладки выбираем сразу.
  const defaultSel =
    pending?.kind === 'placeTile' && pending.options.length === 1
      ? (pending.options[0]?.cell ?? null)
      : null;
  const fresh = picked.rev === rev;
  const sel = fresh ? picked.cell : defaultSel;
  const rotIdx = fresh ? picked.rotIdx : 0;
  const revRef = useRef(rev);
  revRef.current = rev;
  const selRef = useRef(sel);
  selRef.current = sel;
  const setSel = useCallback(
    (cell: Cell | null) => setPicked({ rev: revRef.current, cell, rotIdx: 0 }),
    [],
  );

  // Новое решение — сбросить наведение и ручной фокус.
  // biome-ignore lint/correctness/useExhaustiveDependencies: реагируем только на смену ревизии
  useEffect(() => {
    setHoverStay(false);
    setHoverLine(null);
    setManualFocus(null);
  }, [rev]);

  // Звуки и вспышки атак из последней партии событий.
  // biome-ignore lint/correctness/useExhaustiveDependencies: только по новой ревизии
  useEffect(() => {
    const batch = events.slice(batchStart);
    playEvents(batch);
    const cells = new Set<Cell>();
    for (const e of batch) {
      if (e.type === 'attack') {
        cells.add(e.monsterCell);
        for (const c of e.area) cells.add(c);
      }
    }
    if (!cells.size) return;
    const ms = animMs(900);
    if (!ms) return;
    setFlash(cells);
    setShake((n) => n + 1);
    const t = setTimeout(() => setFlash(EMPTY), ms);
    return () => clearTimeout(t);
  }, [rev]);

  // Плашка «Ход Ольги» при смене игрока в хотсите.
  const lastDecider = useRef<number | null>(null);
  useEffect(() => {
    if (!view || !pending || view.config.players < 2) return;
    const who = view.controllers[pending.prisoner] ?? 0;
    if (lastDecider.current !== null && lastDecider.current !== who) {
      setBanner(`Ход: ${playerName(view.config.playerNames, who)}`);
      const t = setTimeout(() => setBanner(null), 1600);
      lastDecider.current = who;
      return () => clearTimeout(t);
    }
    lastDecider.current = who;
  }, [view, pending]);

  // Автовыкладка, если вариант ровно один.
  useEffect(() => {
    if (!settings.autoPlace || pending?.kind !== 'placeTile') return;
    const only = pending.options.length === 1 ? pending.options[0] : undefined;
    if (only?.rotations.length !== 1) return;
    const rot = only.rotations[0];
    if (rot === undefined) return;
    const t = setTimeout(() => apply({ type: 'placeTile', cell: only.cell, rot }), animMs(450));
    return () => clearTimeout(t);
  }, [pending, settings.autoPlace, apply]);

  const targets = useMemo(() => targetsFor(pending), [pending]);
  const rotations = useMemo(() => rotationsFor(pending, sel), [pending, sel]);
  const rot = rotations.length
    ? (rotations[((rotIdx % rotations.length) + rotations.length) % rotations.length] ?? null)
    : null;
  const ghost = useMemo(
    () => (view ? ghostFor(pending, view, sel, rot) : null),
    [pending, view, sel, rot],
  );
  const action = confirmAction(pending, sel, rot);

  const previewCell = hover !== null && targets.has(hover) ? hover : sel;
  const preview = useMemo((): { pv: MovePreview; move?: ReturnType<typeof moveTo> } | null => {
    if (!view || !pending || hardcore) return null;
    try {
      if (pending.kind === 'action' || pending.kind === 'forcedMove') {
        if (hoverStay && pending.kind === 'action' && pending.stay) {
          return { pv: previewStay(view, pending.prisoner, pending.stay) };
        }
        const move = moveTo(pending, previewCell);
        if (move) return { pv: previewMove(view, pending.prisoner, move), move };
      }
    } catch {
      return null;
    }
    return null;
  }, [view, pending, hardcore, hoverStay, previewCell]);

  const previewLines = useMemo(
    () => (preview && view ? describePreview(view, preview.pv, preview.move) : null),
    [preview, view],
  );

  const sight = useMemo(() => {
    if (!view || hardcore) return EMPTY;
    if (showAll) return allAreas(view);
    if (ghost && pending?.kind === 'placeTile')
      return new Set(hypotheticalArea(view, ghost, pending.tile));
    if (hover !== null && monsterAt(view, hover)) return areaOf(view, hover);
    return EMPTY;
  }, [view, hardcore, showAll, ghost, pending, hover]);

  const danger = useMemo(() => {
    // Плакальщик: показать квадрат 3×3 под выбранным углом.
    if (pending?.kind === 'mournerPlacement' && view && previewCell !== null) {
      return pending.origins.includes(previewCell)
        ? new Set(squareCells(view.size, previewCell))
        : EMPTY;
    }
    if (!preview) return EMPTY;
    const out = new Set<Cell>();
    for (const a of preview.pv.attacks) {
      out.add(a.monsterCell);
      for (const c of a.area) out.add(c);
    }
    return out;
  }, [preview, pending, view, previewCell]);

  const endangered = useMemo(() => {
    if (pending?.kind === 'lightEaterTarget') return new Set(pending.targets);
    if (pending?.kind === 'mournerPlacement' && view) {
      return new Set(
        view.prisoners.filter((p) => p.cell !== null && danger.has(p.cell)).map((p) => p.id),
      );
    }
    return preview ? new Set(preview.pv.hits.map((h) => h.prisoner)) : EMPTY;
  }, [preview, pending, view, danger]);

  const lines = useMemo(() => {
    if (pending?.kind !== 'fallLine') return [];
    const l = hoverLine !== null ? pending.options[hoverLine] : undefined;
    return l ? [l] : pending.options;
  }, [pending, hoverLine]);

  const focus = useMemo(() => {
    if (!view) return null;
    if (manualFocus !== null) return manualFocus;
    if (pending?.kind === 'fallLine') return pending.cell;
    const who = pending ? pending.prisoner : view.turn.active;
    return view.prisoners[who]?.cell ?? null;
  }, [view, pending, manualFocus]);
  const stableFocus = useRef<Cell | null>(null);
  if (focus !== null) stableFocus.current = focus;

  const doApply = useCallback(
    (a: Action) => {
      // Второе подтверждение до перерисовки относилось бы к уже прошедшему решению.
      if (useGame.getState().rev !== revRef.current) return;
      setSel(null);
      apply(a);
    },
    [apply, setSel],
  );

  const confirm = useCallback(() => {
    if (action) doApply(action);
  }, [action, doApply]);

  const onCellClick = useCallback(
    (cell: Cell) => {
      if (!pending) return;
      if (!targets.has(cell)) {
        setSel(null);
        return;
      }
      if (confirmsOnFirstClick(pending)) {
        const a = confirmAction(pending, cell, null);
        if (a) doApply(a);
        return;
      }
      if (sel === cell && action) {
        doApply(action);
        return;
      }
      setSel(cell);
    },
    [pending, targets, sel, action, doApply, setSel],
  );

  const rotate = useCallback(
    (step: number) =>
      setPicked((p) => {
        const same = p.rev === revRef.current;
        return {
          rev: revRef.current,
          cell: same ? p.cell : selRef.current,
          rotIdx: (same ? p.rotIdx : 0) + step,
        };
      }),
    [],
  );

  // Клавиатура.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pending || surrender || settingsOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const onButton = el?.tagName === 'BUTTON';
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEY_DIRS[e.code];
      if (dir !== undefined && (pending.kind === 'action' || pending.kind === 'forcedMove')) {
        const m = pending.moves.find((mv) => mv.dir === dir);
        if (m) {
          e.preventDefault();
          if (sel === m.to) doApply({ type: 'move', dir: m.dir });
          else setSel(m.to);
        }
        return;
      }
      switch (e.code) {
        case 'Space':
          if (onButton) return;
          if (pending.kind === 'action' && pending.stay) {
            e.preventDefault();
            doApply({ type: 'stay' });
          }
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (onButton) return;
          if (action) {
            e.preventDefault();
            doApply(action);
          } else if (pending.kind === 'action' && pending.canEnd && pending.extra) {
            e.preventDefault();
            doApply({ type: 'endTurn' });
          }
          break;
        case 'KeyE':
          if (pending.kind === 'action' && pending.canEnd) doApply({ type: 'endTurn' });
          break;
        case 'KeyR':
          rotate(e.shiftKey ? -1 : 1);
          break;
        case 'Escape':
          setSel(null);
          break;
        case 'KeyL':
          setShowAll((v) => !v);
          break;
        case 'Digit1':
        case 'Digit2': {
          const i = e.code === 'Digit1' ? 0 : 1;
          if (pending.kind === 'dodge') doApply({ type: 'dodge', use: i === 0 });
          if (pending.kind === 'fallLine' && i < pending.options.length)
            doApply({ type: 'fallLine', index: i });
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, sel, action, doApply, rotate, surrender, settingsOpen, setSel]);

  if (!view || !game) return null;

  const active = view.prisoners[view.turn.active];
  const over = view.phase === 'won' || view.phase === 'lost';
  const drawn =
    pending?.kind === 'placeTile'
      ? (view.tiles[pending.tile] as TileKind)
      : pending?.kind === 'placeStart'
        ? 'start'
        : null;

  const restart = (sameSeed: boolean) => newGame(game.config, sameSeed ? game.seed : randomSeed());

  return (
    <div className="game">
      <header className="game__header">
        <div className="game__turn">
          {view.turn.number > 0 && <span className="game__turnNo">Ход {view.turn.number}</span>}
          {active && view.phase === 'play' && (
            <span>
              <span className={`dot dot--${active.color}`} aria-hidden="true" />{' '}
              {PRISONER_NAMES[active.color]}
              {view.config.players > 1 && (
                <> ({playerName(view.config.playerNames, view.controllers[active.id] ?? 0)})</>
              )}
            </span>
          )}
          {view.phase === 'setup' && <span>Подготовка: узники выбирают место</span>}
        </div>
        <div className="game__seed" title="Seed партии">
          расклад «{game.seed}»
        </div>
        <div className="game__menu">
          {!hardcore && (
            <button
              type="button"
              className={`btn btn--ghost ${showAll ? 'is-on' : ''}`}
              onClick={() => setShowAll((v) => !v)}
              title="Все линии видимости (L)"
            >
              Линии
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
            Настройки
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            Меню
          </button>
        </div>
      </header>

      <aside className="game__left">
        <PrisonersPanel
          view={view}
          deciding={pending?.prisoner ?? null}
          onFocus={(id) => {
            const c = view.prisoners[id]?.cell;
            if (c !== null && c !== undefined) setManualFocus(c);
          }}
        />
        {drawn && (
          <section className="panel drawn" aria-label="Вытянутая плитка">
            <h2 className="panel__title">
              {pending?.kind === 'placeStart' ? 'Стартовый фрагмент' : 'Вытянута плитка'}
            </h2>
            <div className="drawn__tile">
              <TileSvg
                kind={drawn}
                rot={rot ?? 0}
                pit={false}
                seed={pending?.kind === 'placeTile' ? pending.tile : (pending?.prisoner ?? 0)}
              />
            </div>
            <p className="drawn__name">{TILE_NAMES[drawn]}</p>
          </section>
        )}
      </aside>

      <main className={`game__board ${shake % 2 ? 'shake-a' : shake ? 'shake-b' : ''}`}>
        <Board
          view={view}
          targets={targets}
          selected={sel}
          ghost={ghost}
          sight={sight}
          danger={danger}
          endangered={endangered}
          lines={lines}
          focus={stableFocus.current}
          followCamera={settings.followCamera}
          flash={flash}
          onCellClick={onCellClick}
          onCellHover={setHover}
          onWheel={(dy) => {
            if (rotations.length > 1) rotate(dy > 0 ? 1 : -1);
          }}
        />
        {banner && <div className="banner">{banner}</div>}
      </main>

      <aside className="game__right">
        <PileCandle view={view} />
        <DiscardSummary view={view} />
        <EventLog
          view={view}
          events={events}
          batchStart={batchStart}
          onHighlight={(cells) => {
            setFlash(new Set(cells));
            setTimeout(() => setFlash(EMPTY), 1200);
          }}
        />
      </aside>

      <footer className="game__footer">
        {pending && (
          <ActionBar
            view={view}
            pending={pending}
            canConfirm={action !== null}
            rotations={rotations}
            preview={previewLines}
            error={error}
            hardcore={hardcore}
            onConfirm={confirm}
            onRotate={rotate}
            onAction={doApply}
            onHoverStay={setHoverStay}
            onHoverLine={setHoverLine}
            onSurrender={() => setSurrender(true)}
          />
        )}
      </footer>

      {surrender && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="surrender-title">
          <div className="dialog">
            <h2 id="surrender-title">Сдаться тьме?</h2>
            <p>Партия закончится поражением.</p>
            <div className="dialog__buttons">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setSurrender(false);
                  doApply({ type: 'surrender' });
                }}
              >
                Сдаться
              </button>
              <button
                type="button"
                className="btn"
                ref={focusOnMount}
                onClick={() => setSurrender(false)}
              >
                Играть дальше
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="dialog dialog--wide">
            <h2 id="settings-title">Настройки</h2>
            <SettingsPanel />
            <div className="dialog__buttons">
              <button
                type="button"
                className="btn btn--primary"
                ref={focusOnMount}
                onClick={() => setSettingsOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {over && (
        <EndScreen
          view={view}
          onAgain={() => restart(false)}
          onSameSeed={() => restart(true)}
          onReplay={() =>
            downloadReplay({
              v: 1,
              config: game.config,
              seed: game.seed,
              actions: [...game.actions],
              startedAt: Date.now(),
              finishedAt: Date.now(),
            })
          }
          onMenu={onMenu}
        />
      )}
    </div>
  );
}
