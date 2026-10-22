import { ENGINE_VERSION } from '@darkheaven/engine';

export function App() {
  return (
    <main className="placeholder">
      <h1>DarkHeaven</h1>
      <p>Свеча зажжена. Лабиринт строится…</p>
      <small>движок {ENGINE_VERSION}</small>
    </main>
  );
}
