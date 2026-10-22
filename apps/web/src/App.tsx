import { useEffect, useState } from 'react';
import { SvgDefs } from './board/Tile';
import { GameScreen } from './game/GameScreen';
import { MainMenu, type Screen } from './screens/MainMenu';
import { NewGame } from './screens/NewGame';
import { Rules } from './screens/Rules';
import { SettingsPanel } from './screens/SettingsPanel';
import { useGame } from './store/game';
import { useSettings } from './store/settings';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const quit = useGame((s) => s.quit);
  const fontScale = useSettings((s) => s.fontScale);
  const anim = useSettings((s) => s.anim);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.dataset.anim = anim;
  }, [anim]);

  return (
    <>
      <SvgDefs />
      {screen === 'menu' && <MainMenu go={setScreen} />}
      {screen === 'new' && (
        <NewGame onStart={() => setScreen('game')} onBack={() => setScreen('menu')} />
      )}
      {screen === 'rules' && <Rules onBack={() => setScreen('menu')} />}
      {screen === 'settings' && (
        <div className="page">
          <header className="page__header">
            <button type="button" className="btn btn--ghost" onClick={() => setScreen('menu')}>
              ← Назад
            </button>
            <h1>Настройки</h1>
          </header>
          <SettingsPanel />
        </div>
      )}
      {screen === 'game' && (
        <GameScreen
          onMenu={() => {
            quit();
            setScreen('menu');
          }}
        />
      )}
    </>
  );
}
