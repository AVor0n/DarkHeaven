import { useGame } from '../store/game';

export type Screen = 'menu' | 'new' | 'game' | 'rules' | 'settings';

function MenuCandle() {
  return (
    <svg viewBox="0 0 120 220" className="menu__candle" aria-hidden="true">
      <defs>
        <radialGradient id="menu-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f3c77a" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#f3c77a" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="menu-wax" x1="0" x2="1">
          <stop offset="0%" stopColor="#cfc3ab" />
          <stop offset="45%" stopColor="#efe6d4" />
          <stop offset="100%" stopColor="#a99b84" />
        </linearGradient>
      </defs>
      <circle cx={60} cy={58} r={56} fill="url(#menu-halo)" className="menu__halo" />
      <g className="candle__flame" style={{ transformOrigin: '60px 86px' }}>
        <path d="M60 30c11 16 14 27 7 37a9 9 0 0 1-14 0c-7-10-4-21 7-37z" fill="#ffcf73" />
        <path d="M60 48c4 8 5 13 2 17a3 3 0 0 1-4 0c-3-4-2-9 2-17z" fill="#fff6dc" />
      </g>
      <path d="M60 70v14" stroke="#1a1414" strokeWidth={2.4} />
      <path d="M38 88q11 -5 22 0t22 0v112H38z" fill="url(#menu-wax)" />
      <path d="M44 92q-2 18 1 30" stroke="#fff" strokeOpacity={0.45} strokeWidth={3} fill="none" />
      <path
        d="M78 90q3 10 0 16q-3 6 1 14"
        stroke="#b9ad96"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx={60} cy={204} rx={40} ry={8} fill="#3a2f27" />
    </svg>
  );
}

export function MainMenu({ go }: { go(s: Screen): void }) {
  const saved = useGame((s) => s.saved);
  const resume = useGame((s) => s.resume);
  return (
    <div className="menu">
      <div className="menu__hero">
        <MenuCandle />
        <h1 className="menu__title">DarkHeaven</h1>
        <p className="menu__subtitle">
          кооперативный побег из лабиринта, который тает вместе со свечой
        </p>
      </div>
      <nav className="menu__nav" aria-label="Главное меню">
        {saved && (
          <button
            type="button"
            className="menu__item"
            onClick={() => {
              if (resume()) go('game');
            }}
          >
            Продолжить
          </button>
        )}
        <button type="button" className="menu__item" onClick={() => go('new')}>
          Новая партия
        </button>
        <button type="button" className="menu__item" onClick={() => go('rules')}>
          Как играть
        </button>
        <button type="button" className="menu__item" onClick={() => go('settings')}>
          Настройки
        </button>
      </nav>
      <p className="menu__credits">
        Фанатская веб-версия по мотивам настольной игры «Обитель тьмы». Весь арт и тексты свои.
      </p>
    </div>
  );
}
