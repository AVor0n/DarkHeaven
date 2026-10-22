import { cellXY, type GameState } from '@darkheaven/engine';
import { type RefObject, useEffect, useRef } from 'react';
import { animMs } from '../store/settings';

interface Camera {
  x: number;
  y: number;
}

interface Glow {
  x: number;
  y: number;
  lit: number;
}

function wrapDelta(d: number, n: number): number {
  return ((((d + n / 2) % n) + n) % n) - n / 2;
}

/**
 * Слой тьмы поверх поля: всё затянуто мраком, вокруг горящих свечей — мерцающие
 * пятна света, вокруг погашенных — тусклые. Положение света плавно догоняет
 * фишку, даже если сама фишка перескочила в другую клетку.
 */
export function LightCanvas({
  view,
  cs,
  camRef,
}: {
  view: GameState;
  cs: number;
  camRef: RefObject<Camera>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const glows = useRef(new Map<number, Glow>());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const n = viewRef.current.size;
    const px = cs * (n + 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    canvas.style.width = `${px}px`;
    canvas.style.height = `${px}px`;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = viewRef.current;
      const cam = camRef.current ?? { x: 0, y: 0 };
      const still = animMs(1) === 0;
      const t = still ? 0 : now / 1000;

      // Положения источников света догоняют узников.
      const seen = new Set<number>();
      for (const p of v.prisoners) {
        if (p.cell === null) continue;
        seen.add(p.id);
        const [tx, ty] = cellXY(n, p.cell);
        const g = glows.current.get(p.id);
        const target = p.lit ? 1 : 0;
        if (!g || still) {
          glows.current.set(p.id, { x: tx, y: ty, lit: target });
          continue;
        }
        const k = 1 - Math.exp(-dt * 9);
        g.x += wrapDelta(tx - g.x, n) * k;
        g.y += wrapDelta(ty - g.y, n) * k;
        g.x = ((g.x % n) + n) % n;
        g.y = ((g.y % n) + n) % n;
        g.lit += (target - g.lit) * (1 - Math.exp(-dt * 4));
      }
      for (const id of [...glows.current.keys()]) if (!seen.has(id)) glows.current.delete(id);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, px, px);
      const gloom = v.lastFlicker ? 0.72 : 0.5;
      ctx.fillStyle = `rgba(4, 3, 7, ${gloom})`;
      ctx.fillRect(0, 0, px, px);

      // Вырезаем свет из тьмы.
      ctx.globalCompositeOperation = 'destination-out';
      const spots: [number, number, number, number][] = [];
      for (const [id, g] of glows.current) {
        const flicker = 1 + Math.sin(t * 7.3 + id * 1.7) * 0.03 + Math.sin(t * 13.1 + id) * 0.02;
        const radius = cs * (0.8 + 1.2 * g.lit) * flicker * (v.lastFlicker ? 0.85 : 1);
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const cx = (g.x + kx * n - cam.x + 0.5 + 0.5) * cs;
            const cy = (g.y + ky * n - cam.y + 0.5 + 0.5) * cs;
            if (cx < -radius || cy < -radius || cx > px + radius || cy > px + radius) continue;
            spots.push([cx, cy, radius, g.lit]);
          }
        }
      }
      for (const [cx, cy, r, lit] of spots) {
        const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        grad.addColorStop(0, `rgba(0,0,0,${0.85 + 0.15 * lit})`);
        grad.addColorStop(0.55, `rgba(0,0,0,${0.5 + 0.3 * lit})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Тёплый отсвет пламени.
      ctx.globalCompositeOperation = 'lighter';
      for (const [cx, cy, r, lit] of spots) {
        if (lit < 0.05) continue;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.9);
        grad.addColorStop(0, `rgba(243, 170, 90, ${0.14 * lit})`);
        grad.addColorStop(1, 'rgba(243, 170, 90, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cs, camRef]);

  return <canvas ref={canvasRef} className="board__light" />;
}
