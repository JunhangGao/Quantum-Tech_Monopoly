import { computerChoice } from './ai.js';
import { BoardView, node } from './board.js';
import { loadData } from './config.js';
import { Game, Phase } from './game.js';
import { PLAYER_COLORS, validatePlayers } from './player.js';
import { actions, button, byId, decisionContent, guideContent, paintCity, playerFields,
  renderPanels, renderTurn, resultsContent, rulesContent, showDialog, tileContent } from './ui.js';

const roster = Object.keys(PLAYER_COLORS).map((color, index) => ({
  color, name: 'Player ' + (index + 1), type: 'human',
}));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const modal = byId('dialog');
const form = byId('setup-form');
const turnButton = byId('turn-button');
let data;
let game;
let board;
let timer;
let dialogType;
let restoreFocus;
let soundEnabled = true;
let audio;
let music;
let musicEnabled = true;
let count = 2;

function playSound(id) {
  if (!soundEnabled || !data.assets[id]) return;
  audio?.pause();
  audio = new Audio(data.assets[id]);
  audio.volume = 0.22;
  audio.play().catch(() => {});
}

function updateMusicControl() {
  byId('music-button').setAttribute('aria-pressed', String(musicEnabled));
  byId('music-label').textContent = musicEnabled ? 'Music on' : 'Music off';
}

function startMusic() {
  if (!data?.assets.music || !musicEnabled) return;
  if (!music) {
    const track = new Audio(data.assets.music);
    track.loop = true;
    track.volume = 0.10;
    music = track;
  }
  const track = music;
  track.play().catch(() => {
    if (music !== track) return;
    music = null;
  });
}

function stopMusic() {
  if (music) {
    music.pause();
    music = null;
  }
}

function setSetupError(message) {
  const error = byId('setup-error');
  error.textContent = message;
  error.hidden = !message;
}

function show(name, settings) {
  if (!dialogType) restoreFocus = document.activeElement;
  dialogType = name;
  clearTimeout(timer);
  showDialog(settings);
  // A decision dialog runs only the current computer's turn.
  schedule();
}

function hideDialog(returnFocus = true) {
  dialogType = null;
  if (modal.open) modal.close();
  if (returnFocus && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  restoreFocus = null;
  schedule();
}

function info(settings) {
  if (dialogType) return;
  settings.content.push(actions(button('Close', () => hideDialog(), { primary: true })));
  show('info', settings);
}

function inspect(tile) {
  if (game) info(tileContent(game, tile));
}

function render({ follow = false, rolling = false } = {}) {
  board.render(game, follow);
  renderTurn(game, rolling);
  renderPanels(game);
}

function reset() {
  clearTimeout(timer);
  audio?.pause();
  game = null;
  board = null;
  hideDialog(false);
  byId('log').replaceChildren();
  delete byId('log').dataset.count;
  byId('player-list').replaceChildren();
  byId('board').querySelectorAll('.tile').forEach(tile => tile.remove());
  byId('play').hidden = true;
  byId('lobby').hidden = false;
  byId('lobby-title').focus();
}

function showResults() {
  show('results', resultsContent(game, reset, () => {
    hideDialog(false);
    turnButton.focus({ preventScroll: true });
  }));
}

function roll() {
  if (!game.roll()) return;
  playSound('roll');
  render({ rolling: true });
  schedule(reducedMotion.matches ? 0 : 640);
}

function resolve() {
  game.resolveLanding();
  render();
  if (game.pending) {
    if (game.pending.kind === 'event') playSound('event');
    show('decision', decisionContent(game, decide));
  } else {
    if (game.current.type === 'human') turnButton.focus({ preventScroll: true });
    schedule();
  }
}

function move() {
  do {
    game.step();
    render({ follow: true });
  } while (game.phase === Phase.MOVING && reducedMotion.matches);
  if (game.phase === Phase.MOVING || !reducedMotion.matches) {
    schedule();
    return;
  }
  resolve();
}

function decide(choice) {
  if (!game?.decide(choice)) return;
  playSound('action');
  render();
  if (game.pending) {
    show('decision', decisionContent(game, decide));
  } else {
    hideDialog(false);
    if (game.current.type === 'human') turnButton.focus({ preventScroll: true });
  }
}

function endTurn() {
  if (!game.endTurn()) return;
  render();
  if (game.phase === Phase.GAME_OVER) showResults();
  else {
    if (game.current.type === 'human') turnButton.focus({ preventScroll: true });
    schedule();
  }
}

function schedule(delay) {
  clearTimeout(timer);
  if (!game || (dialogType && dialogType !== 'decision')) return;
  const { current, phase, pending } = game;
  let action;
  let defaultDelay;
  if (phase === Phase.MOVING) {
    action = move;
    defaultDelay = 340;
  } else if (phase === Phase.RESOLVING) {
    action = resolve;
    defaultDelay = 360;
  } else if (current.type === 'ai') {
    if (phase === Phase.AWAIT_ROLL) [action, defaultDelay] = [roll, 650];
    if (phase === Phase.AWAIT_DECISION) {
      action = () => decide(computerChoice(game));
      defaultDelay = pending.kind === 'event' ? 2900 : 1450;
    }
    if (phase === Phase.TURN_END) [action, defaultDelay] = [endTurn, 680];
  }
  if (!action) return;
  const currentGame = game;
  const wait = phase === Phase.MOVING && reducedMotion.matches ? 0 : (delay ?? defaultDelay);
  timer = setTimeout(() => {
    if (game === currentGame) action();
  }, wait);
}

form.addEventListener('change', event => {
  setSetupError('');
  if (event.target.name === 'count') {
    count = Number(event.target.value);
    playerFields(byId('player-config'), roster, count);
  }
});
form.addEventListener('input', () => setSetupError(''));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!data || game) return;
  const players = roster.slice(0, count);
  const error = validatePlayers(players);
  if (error) {
    setSetupError(error);
    return;
  }
  game = new Game(data, players);
  board = new BoardView(byId('board'), game, inspect);
  board.element.parentElement.scrollLeft = 0;
  byId('lobby').hidden = true;
  byId('play').hidden = false;
  byId('game-title').focus();
  playSound('action');
  startMusic();
  render();
  schedule();
});

turnButton.addEventListener('click', event => {
  if (!game || dialogType || event.detail > 1) return;
  if (game.phase === Phase.GAME_OVER) showResults();
  else if (game.current.type === 'human') {
    if (game.phase === Phase.AWAIT_ROLL) roll();
    else if (game.phase === Phase.TURN_END) endTurn();
  }
});

byId('new-button').addEventListener('click', () => {
  show('restart', { title: 'Start a new game?', label: 'Game setup', content: [
    node('p', '', game.phase === Phase.GAME_OVER ? 'Return to the player setup screen.' : 'The current game will end. You can set up new players.'),
    actions(button('Back to board', () => hideDialog()), button('New game', reset, { primary: true })),
  ] });
});
byId('rules-button').addEventListener('click', () => info(rulesContent(data.rules)));
byId('science-button').addEventListener('click', () => info(guideContent(data)));
byId('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  const control = byId('sound-button');
  byId('sound-label').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  control.setAttribute('aria-pressed', String(soundEnabled));
  if (soundEnabled) playSound('action');
  else audio?.pause();
});
byId('music-button').addEventListener('click', () => {
  musicEnabled = !musicEnabled;
  if (musicEnabled) startMusic();
  else stopMusic();
  updateMusicControl();
});
modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (dialogType !== 'decision') hideDialog();
});

async function init() {
  byId('loading').hidden = false;
  byId('load-error').hidden = true;
  try {
    data = await loadData();
    byId('hero-rounds').textContent = data.rules.maxRounds + ' rounds';
    playerFields(byId('player-config'), roster, count);
    paintCity(data);
    for (const id of ['rules-button', 'science-button', 'sound-button']) byId(id).disabled = false;
    byId('music-button').disabled = !data.assets.music;
    if (!data.assets.music) musicEnabled = false;
    updateMusicControl();
    byId('lobby').hidden = false;
  } catch (error) {
    byId('load-message').textContent = error instanceof Error ? error.message : 'An unexpected error occurred.';
    byId('load-error').hidden = false;
  } finally {
    byId('loading').hidden = true;
  }
}

byId('retry-button').addEventListener('click', init);
init();
