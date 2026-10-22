import type { GameEvent } from '@darkheaven/engine';
import { Howl, Howler } from 'howler';
import { asset } from '../board/Emblems';
import { useSettings } from '../store/settings';

export type Sfx =
  | 'step'
  | 'place'
  | 'crumble'
  | 'fall'
  | 'monster'
  | 'extinguish'
  | 'relight'
  | 'key'
  | 'resolve'
  | 'flicker'
  | 'win'
  | 'lose'
  | 'herald'
  | 'mourner'
  | 'endBearer';

const SFX: Sfx[] = [
  'step',
  'place',
  'crumble',
  'fall',
  'monster',
  'extinguish',
  'relight',
  'key',
  'resolve',
  'flicker',
  'win',
  'lose',
  'herald',
  'mourner',
  'endBearer',
];

function src(name: string): string[] {
  return [asset(`audio/${name}.webm`), asset(`audio/${name}.mp3`)];
}

let sfx: Map<Sfx, Howl> | null = null;
let ambient: Howl | null = null;
let music: Howl | null = null;

function loadSfx(): Map<Sfx, Howl> {
  if (!sfx) sfx = new Map(SFX.map((n) => [n, new Howl({ src: src(n), preload: true })]));
  return sfx;
}

/** Громкости каналов; «без звука» действует глобально через Howler.mute. */
function volumes() {
  const s = useSettings.getState();
  Howler.mute(s.muted);
  return { sfx: s.muted ? 0 : s.sfx, ambient: s.ambient * 0.6, music: s.music * 0.7 };
}

function fadeOut(h: Howl | null): void {
  if (!h?.playing()) return;
  h.once('fade', () => {
    if (h.volume() === 0) h.pause();
  });
  h.fade(h.volume(), 0, 700);
}

export function playSfx(name: Sfx, delayMs = 0): void {
  const v = volumes().sfx;
  if (v <= 0) return;
  const howl = loadSfx().get(name);
  if (!howl) return;
  const play = () => {
    const id = howl.play();
    howl.volume(v, id);
  };
  if (delayMs > 0) setTimeout(play, delayMs);
  else play();
}

/** Фон: в меню — музыка, в партии — эмбиент подземелья. */
export function setBackground(kind: 'menu' | 'game' | 'none'): void {
  const v = volumes();
  if (kind === 'menu') {
    fadeOut(ambient);
    music ??= new Howl({
      src: src('menu'),
      loop: true,
      html5: true,
      volume: 0,
      // Браузер не даёт играть до первого жеста пользователя — ждём разблокировки.
      onplayerror: () => music?.once('unlock', () => music?.play()),
    });
    if (!music.playing()) music.play();
    music.fade(music.volume(), v.music, 1500);
  } else if (kind === 'game') {
    fadeOut(music);
    ambient ??= new Howl({ src: src('ambient'), loop: true, volume: 0 });
    if (!ambient.playing()) ambient.play();
    ambient.fade(ambient.volume(), v.ambient, 1500);
  } else {
    fadeOut(music);
    fadeOut(ambient);
  }
}

/** Применить новые громкости к уже играющему фону. */
export function applyVolumes(): void {
  const v = volumes();
  if (music?.playing()) music.volume(v.music);
  if (ambient?.playing()) ambient.volume(v.ambient);
}

const EVENT_SFX: Partial<Record<GameEvent['type'], Sfx>> = {
  moved: 'step',
  tilePlaced: 'place',
  crumbled: 'crumble',
  pitOpened: 'crumble',
  fell: 'fall',
  attack: 'monster',
  extinguished: 'extinguish',
  relit: 'relight',
  keyTaken: 'key',
  keyGiven: 'key',
  resolveGained: 'resolve',
  lastFlicker: 'flicker',
  lightEaten: 'extinguish',
  heraldSetAside: 'herald',
  mournerPlaced: 'mourner',
  endBearerArrived: 'endBearer',
  won: 'win',
  lost: 'lose',
};

/** Озвучить партию событий: каждый звук один раз, по порядку, с небольшим сдвигом. */
export function playEvents(events: GameEvent[]): void {
  const seen = new Set<Sfx>();
  for (const e of events) {
    const s = EVENT_SFX[e.type];
    if (s) seen.add(s);
  }
  // Финал заглушает всё остальное.
  if (seen.has('win') || seen.has('lose')) {
    playSfx(seen.has('win') ? 'win' : 'lose', 300);
    return;
  }
  let delay = 0;
  for (const s of seen) {
    playSfx(s, delay);
    delay += 140;
  }
}
