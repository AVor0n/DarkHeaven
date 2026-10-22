import {
  type Cell,
  cellXY,
  type FallLine,
  type GameState,
  type Prisoner,
  type Rot,
  type TileKind,
} from '@darkheaven/engine';
import {
  type CSSProperties,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { animMs } from '../store/settings';
import { LightCanvas } from './LightCanvas';
import { CandleToken } from './Prisoner';
import { MournerSvg, TileSvg } from './Tile';

export type TargetKind =
  | 'move'
  | 'dash'
  | 'pit'
  | 'empty'
  | 'keeper'
  | 'place'
  | 'start'
  | 'land'
  | 'discard';

/** Как фишка появилась в клетке в последней партии событий (для анимации). */
export interface TokenMotion {
  kind: 'move' | 'land';
  /** Откуда пришла фишка, в клетках относительно новой клетки. */
  dx: number;
  dy: number;
}

export interface Ghost {
  cell: Cell;
  kind: TileKind;
  rot: Rot;
  seed: number;
}

export interface BoardProps {
  view: GameState;
  targets: Map<Cell, TargetKind>;
  selected: Cell | null;
  ghost: Ghost | null;
  /** Клетки линий видимости (подсказка). */
  sight: Set<Cell>;
  /** Клетки под ударом в превью хода. */
  danger: Set<Cell>;
  /** Узники, которых заденет атака в превью. */
  endangered: Set<number>;
  lines: FallLine[];
  focus: Cell | null;
  followCamera: boolean;
  /** Клетки, по которым только что прошла атака (вспышка). */
  flash: Set<Cell>;
  motion: Map<number, TokenMotion>;
  onCellClick(cell: Cell): void;
  onCellHover(cell: Cell | null): void;
  onWheel?(delta: number): void;
}

interface Camera {
  x: number;
  y: number;
}

function wrapNear(v: number, n: number): number {
  // В диапазон [-n/2, n/2).
  return ((((v + n / 2) % n) + n) % n) - n / 2;
}

/** Смещение камеры, при котором клетка оказывается в центре видимой области. */
function cameraFor(size: number, cell: Cell): Camera {
  const [x, y] = cellXY(size, cell);
  return { x: wrapNear(x - (size - 1) / 2, size), y: wrapNear(y - (size - 1) / 2, size) };
}

const CellView = memo(function CellView({
  view,
  cell,
  target,
  selected,
  ghost,
  sight,
  danger,
  inLine,
  flash,
  endangered,
  mourner,
  motion,
}: {
  view: GameState;
  cell: Cell;
  target: TargetKind | undefined;
  selected: boolean;
  ghost: Ghost | null;
  sight: boolean;
  danger: boolean;
  inLine: boolean;
  flash: boolean;
  endangered: Set<number>;
  /** Положение клетки внутри ямы Плакальщика. */
  mourner: readonly [number, number] | null;
  motion: Map<number, TokenMotion>;
}) {
  const bt = view.board[cell];
  const prisoners = view.prisoners.filter((p) => p.cell === cell);
  const kind = bt ? (view.tiles[bt.tile] as TileKind) : null;
  return (
    <>
      {bt && kind && (
        <div className="cell__tile" key={bt.tile}>
          <TileSvg kind={kind} rot={bt.rot} pit={bt.pit} seed={bt.tile} keyTaken={bt.keyTaken} />
        </div>
      )}
      {bt?.mournerPit && mourner && (
        <div className="cell__tile cell__tile--mourner">
          <MournerSvg dx={mourner[0]} dy={mourner[1]} />
        </div>
      )}
      {ghost && (
        <div className="cell__ghost">
          <TileSvg kind={ghost.kind} rot={ghost.rot} pit={false} seed={ghost.seed} />
        </div>
      )}
      {sight && <div className="cell__sight" />}
      {danger && <div className="cell__danger" />}
      {inLine && <div className="cell__line" />}
      {flash && <div className="cell__flash" />}
      {target && (
        <div className={`cell__target cell__target--${target} ${selected ? 'is-selected' : ''}`} />
      )}
      {prisoners.length > 0 && (
        <div className={`cell__prisoners cell__prisoners--${Math.min(prisoners.length, 4)}`}>
          {prisoners.map((p: Prisoner) => {
            const m = motion.get(p.id);
            return (
              <div key={p.id} className={`token ${endangered.has(p.id) ? 'token--danger' : ''}`}>
                <div
                  className={m ? `token__body token__body--${m.kind}` : 'token__body'}
                  style={m ? ({ '--fx': m.dx, '--fy': m.dy } as CSSProperties) : undefined}
                >
                  <CandleToken prisoner={p} active={view.turn.active === p.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

/**
 * Поле-тор. Рисуется 3×3 копии поля, видимая область — N+1 клетка (по половине
 * клетки с каждой стороны показывает перенос через край). Камера плавно
 * сдвигает слой копий; из-за периодичности сдвиг всегда можно нормализовать.
 */
export function Board(props: BoardProps) {
  const { view, focus, followCamera } = props;
  const n = view.size;
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0 });
  const [cs, setCs] = useState(80);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCs(Math.max(32, Math.floor(Math.min(r.width, r.height) / (n + 1))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  const applyCamera = (c: Camera) => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${-(n + c.x - 0.5) * cs}px, ${-(n + c.y - 0.5) * cs}px)`;
  };

  // Плавный перевод камеры к фокусной клетке. applyCamera зависит только от n и cs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: камера сама хранит своё положение
  useEffect(() => {
    const target = followCamera && focus !== null ? cameraFor(n, focus) : { x: 0, y: 0 };
    const from = { ...camRef.current };
    const dx = wrapNear(target.x - from.x, n);
    const dy = wrapNear(target.y - from.y, n);
    const duration = animMs(450);
    if (duration === 0 || (dx === 0 && dy === 0)) {
      camRef.current = { x: wrapNear(from.x + dx, n), y: wrapNear(from.y + dy, n) };
      applyCamera(camRef.current);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      camRef.current = { x: from.x + dx * e, y: from.y + dy * e };
      if (t >= 1) camRef.current = { x: wrapNear(from.x + dx, n), y: wrapNear(from.y + dy, n) };
      applyCamera(camRef.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focus, followCamera, n, cs]);

  useLayoutEffect(() => applyCamera(camRef.current));

  const lineCells = useMemo(() => {
    const set = new Set<Cell>();
    for (const l of props.lines) {
      for (let i = 0; i < n; i++) set.add(l.axis === 'row' ? l.index * n + i : i * n + l.index);
    }
    return set;
  }, [props.lines, n]);

  const ghostCell = props.ghost?.cell ?? null;
  // Левый верхний угол ямы Плакальщика (жетон не переносится через край).
  const mournerOrigin = useMemo(() => {
    let ox = n;
    let oy = n;
    view.board.forEach((bt, c) => {
      if (!bt?.mournerPit) return;
      const [x, y] = cellXY(n, c);
      ox = Math.min(ox, x);
      oy = Math.min(oy, y);
    });
    return ox < n ? ([ox, oy] as const) : null;
  }, [view.board, n]);
  const cells = useMemo(() => Array.from({ length: n * n }, (_, i) => i), [n]);
  const copies = [0, 1, 2];

  return (
    <div className="board" ref={wrapRef}>
      <div
        className="board__viewport"
        style={{ width: cs * (n + 1), height: cs * (n + 1), '--cs': `${cs}px` } as CSSProperties}
        onMouseLeave={() => props.onCellHover(null)}
        onWheel={(e) => props.onWheel?.(e.deltaY)}
      >
        <div
          className="board__layer"
          ref={layerRef}
          style={{ width: cs * n * 3, height: cs * n * 3 }}
        >
          {copies.flatMap((ky) =>
            copies.flatMap((kx) =>
              cells.map((cell) => {
                const [x, y] = cellXY(n, cell);
                const central = kx === 1 && ky === 1;
                return (
                  <button
                    type="button"
                    key={`${kx}-${ky}-${cell}`}
                    className={`cell ${central ? '' : 'cell--copy'}`}
                    tabIndex={central && props.targets.has(cell) ? 0 : -1}
                    aria-label={
                      central ? `Клетка ${String.fromCharCode(65 + x)}${y + 1}` : undefined
                    }
                    aria-hidden={central ? undefined : true}
                    style={{
                      left: (kx * n + x) * cs,
                      top: (ky * n + y) * cs,
                      width: cs,
                      height: cs,
                    }}
                    onClick={() => props.onCellClick(cell)}
                    onMouseEnter={() => props.onCellHover(cell)}
                    onFocus={() => props.onCellHover(cell)}
                  >
                    <CellView
                      view={view}
                      cell={cell}
                      target={props.targets.get(cell)}
                      selected={props.selected === cell}
                      ghost={ghostCell === cell ? props.ghost : null}
                      sight={props.sight.has(cell)}
                      danger={props.danger.has(cell)}
                      inLine={lineCells.has(cell)}
                      flash={props.flash.has(cell)}
                      endangered={props.endangered}
                      motion={props.motion}
                      mourner={
                        mournerOrigin && view.board[cell]?.mournerPit
                          ? [x - mournerOrigin[0], y - mournerOrigin[1]]
                          : null
                      }
                    />
                  </button>
                );
              }),
            ),
          )}
        </div>
        <LightCanvas view={view} cs={cs} camRef={camRef} />
        <div className="board__vignette" />
      </div>
    </div>
  );
}
