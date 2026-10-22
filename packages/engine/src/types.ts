/** Направления: 0 — север, 1 — восток, 2 — юг, 3 — запад. */
export type Dir = 0 | 1 | 2 | 3;
/** Поворот плитки по часовой стрелке на rot × 90°. */
export type Rot = 0 | 1 | 2 | 3;
/** Индекс клетки: y * size + x. */
export type Cell = number;

export type TileKind =
  | 'start'
  | 'straight'
  | 't'
  | 'crumblingT'
  | 'cross'
  | 'key'
  | 'gate'
  | 'waxEater'
  | 'keyKeeper'
  | 'darkSpawn'
  | 'herald'
  | 'inevitable'
  | 'lightEater'
  | 'pathBreaker';

export type MonsterKind =
  | 'waxEater'
  | 'keyKeeper'
  | 'inevitable'
  | 'pathBreaker'
  | 'darkSpawn'
  | 'lightEater'
  | 'herald';

export type PrisonerColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

export interface BoardTile {
  /** Id физической плитки (индекс в GameState.tiles); −1 — клетка ямы Плакальщика. */
  tile: number;
  rot: Rot;
  /** Плитка перевёрнута стороной с ямой. */
  pit: boolean;
  /** С плитки с ключом уже взяли ключ. */
  keyTaken?: boolean;
  /** Яма Плакальщика: id общей ямы 3×3. */
  mournerPit?: number;
}

export interface FallLine {
  axis: 'row' | 'col';
  index: number;
}

export interface Prisoner {
  id: number;
  color: PrisonerColor;
  cell: Cell | null;
  /** Линия, вдоль которой падает узник (null — не падает). */
  fall: FallLine | null;
  lit: boolean;
  resolve: number;
  hasKey: boolean;
}

export interface DifficultyConfig {
  /** −1..+2 плиток с ключом относительно стандарта. */
  keyDelta?: number;
  /** Убрать одни врата. */
  removeGate?: boolean;
  /** Заменить 2 Т-образных прохода разрушающимися. */
  chaos?: boolean;
}

export interface GameConfig {
  /** Число игроков-людей 1–5. */
  players: number;
  playerNames?: string[];
  difficulty?: DifficultyConfig;
  /** Расширенные правила: хранители ключей и исчадия тьмы. */
  advanced?: boolean;
  /** Третье исчадие тьмы (только с расширенными правилами). */
  extraSpawn?: boolean;
  /** Число Неотвратимых в запасе: 0, 2 или 3. */
  inevitables?: number;
  /** Плакальщик с двумя предвестниками. */
  mourner?: boolean;
  /** Несущий Конец (5 предвестников). */
  endBearer?: boolean;
  /** Монстры дополнения: число пожирателей света и прерывателей пути. */
  lightEaters?: number;
  pathBreakers?: number;
  /** Добавлять монстров дополнения, не убирая пожирателей воска. */
  expansionAddOnly?: boolean;
}

export type Phase = 'setup' | 'play' | 'won' | 'lost';

export type LossReason =
  | 'noGates'
  | 'noKeys'
  | 'fellNoTiles'
  | 'flickerUnderPrisoner'
  | 'cutOff'
  | 'surrender';

export interface TurnState {
  number: number;
  /** Индекс активного узника. */
  active: number;
  /** Узник получил решимость в этом ходу и не может её тратить. */
  gainedResolve: boolean;
  /** Узник держал ключ с начала хода (для правила «отдать и подобрать»). */
  keyAtStart: boolean;
}

export interface GameStats {
  attacks: number;
  hits: number;
  pileDiscarded: number;
  falls: number;
  tilesPlaced: number;
}

export interface GameState {
  config: GameConfig;
  size: number;
  /** Вид каждой физической плитки по её id. */
  tiles: TileKind[];
  board: (BoardTile | null)[];
  /** Закрытый запас; верх — последний элемент. */
  pile: number[];
  discard: number[];
  /** Отложенные плитки (предвестники рядом с полем). */
  aside: number[];
  prisoners: Prisoner[];
  /** Игрок, управляющий каждым узником (для 3 игроков 4-й узник переходит по кругу). */
  controllers: number[];
  turn: TurnState;
  lastFlicker: boolean;
  /** Несущий Конец появился: в конце каждого хода сбрасывается верх запаса. */
  endBearerActive: boolean;
  heraldsRevealed: number;
  phase: Phase;
  lossReason: LossReason | null;
  stats: GameStats;
}

export interface MoveOption {
  dir: Dir;
  to: Cell;
  /** tile — обычная плитка, pit — прыжок в яму, empty — пустая клетка (тянуть плитку),
   *  dash — рывок на монстра, keeper — безопасный вход на хранителя с «верха». */
  kind: 'tile' | 'pit' | 'empty' | 'dash' | 'keeper';
  /** Сколько решимости стоит это перемещение. */
  cost: number;
}

export interface KeyTransfer {
  from: number;
  to: number;
}

export interface PlacementOption {
  cell: Cell;
  rotations: Rot[];
}

export type Decision =
  | { kind: 'placeStart'; prisoner: number; cells: Cell[] }
  | {
      kind: 'action';
      prisoner: number;
      /** Окно дополнительных перемещений после основного действия. */
      extra: boolean;
      moves: MoveOption[];
      /** normal — остаться с горящей свечой; resolve — за 1 решимость; forced — ходов нет. */
      stay: 'normal' | 'resolve' | 'forced' | null;
      transfers: KeyTransfer[];
      canEnd: boolean;
    }
  | {
      kind: 'placeTile';
      prisoner: number;
      tile: number;
      reason: 'light' | 'setup' | 'darkMove' | 'landing' | 'stayMonster' | 'herald';
      options: PlacementOption[];
    }
  | { kind: 'dodge'; prisoner: number; monsterCell: Cell; amount: number }
  | { kind: 'fallLine'; prisoner: number; cell: Cell; options: FallLine[] }
  | { kind: 'landingCell'; prisoner: number; cells: Cell[]; draw: boolean }
  | { kind: 'forcedMove'; prisoner: number; moves: MoveOption[] }
  | { kind: 'flickerDiscard'; prisoner: number; cells: Cell[]; canKeepFlame: boolean }
  | { kind: 'mournerPlacement'; prisoner: number; heraldCell: Cell; origins: Cell[] }
  | {
      kind: 'lightEaterTarget';
      prisoner: number;
      /** Клетка пожирателя света (null — вытянут при «остаться»). */
      cell: Cell | null;
      targets: number[];
    };

export type Action =
  | { type: 'placeStart'; cell: Cell; rot: Rot }
  | { type: 'move'; dir: Dir }
  | { type: 'stay' }
  | { type: 'giveKey'; from: number; to: number }
  | { type: 'endTurn' }
  | { type: 'placeTile'; cell: Cell; rot: Rot }
  | { type: 'dodge'; use: boolean }
  | { type: 'fallLine'; index: number }
  | { type: 'landingCell'; cell: Cell }
  | { type: 'flickerDiscard'; cell: Cell }
  | { type: 'keepFlame' }
  | { type: 'mournerPlacement'; origin: Cell }
  | { type: 'lightEaterTarget'; prisoner: number }
  | { type: 'surrender' };

export type DiscardReason = 'unlit' | 'flicker' | 'replaced' | 'monster' | 'mourner' | 'keeper';

export type GameEvent =
  | { type: 'turnStarted'; prisoner: number; turn: number }
  | { type: 'tileDrawn'; tile: number; kind: TileKind }
  | { type: 'tilePlaced'; cell: Cell; tile: number; rot: Rot; prisoner: number }
  | { type: 'tileDiscarded'; cell: Cell; tile: number; reason: DiscardReason }
  | { type: 'pileDiscarded'; tiles: number[]; prisoner: number | null }
  | { type: 'moved'; prisoner: number; from: Cell; to: Cell; dir: Dir; forced: boolean }
  | { type: 'stayed'; prisoner: number }
  | { type: 'crumbled'; cell: Cell }
  | { type: 'pitOpened'; cell: Cell; cause: 'spawn' | 'pathBreaker' | 'keeper' | 'lightEater' }
  | { type: 'fell'; prisoner: number; cell: Cell }
  | { type: 'fallLineChosen'; prisoner: number; line: FallLine }
  | { type: 'landed'; prisoner: number; cell: Cell }
  | { type: 'resolveGained'; prisoner: number }
  | {
      type: 'resolveSpent';
      prisoner: number;
      purpose: 'extraMove' | 'dodge' | 'dash' | 'darkStay' | 'keepFlame';
    }
  | { type: 'attack'; monsterCell: Cell; tile: number; area: Cell[]; targets: number[] }
  | { type: 'hit'; prisoner: number; monsterCell: Cell; discard: number }
  | { type: 'extinguished'; prisoner: number }
  | { type: 'relit'; prisoner: number }
  | { type: 'keyTaken'; prisoner: number; cell: Cell }
  | { type: 'keyGiven'; from: number; to: number }
  | { type: 'heraldSetAside'; tile: number; count: number }
  | { type: 'lightEaten'; cell: Cell | null; prisoner: number | null }
  | { type: 'mournerPlaced'; origin: Cell; cells: Cell[] }
  | { type: 'mournerPitRemoved'; cells: Cell[] }
  | { type: 'endBearerArrived' }
  | { type: 'lastFlicker' }
  | { type: 'won' }
  | { type: 'lost'; reason: LossReason };
