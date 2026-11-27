import { art, categoryNames, node, setTokenColor, specialTiles, token } from './board.js';
import { effectSummary } from './events.js';
import { Phase } from './game.js';
import { PLAYER_COLORS } from './player.js';
import { assetValue, portfolio, rentFor } from './property.js';

export const byId = id => document.getElementById(id);
const number = new Intl.NumberFormat('en');
const pips = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const faceRotations = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};
let dieSpins = 0;

function ensureDieCube(die) {
  let cube = die.querySelector('.die-cube');
  if (cube) return cube;
  const shadow = node('span', 'die-shadow');
  const stage = node('div', 'die-stage');
  cube = node('div', 'die-cube');
  for (let face = 1; face <= 6; face += 1) {
    const side = node('div', 'die-face');
    side.dataset.face = String(face);
    for (const position of pips[face]) {
      const pip = node('span', 'die-pip');
      pip.style.gridArea = (Math.floor(position / 3) + 1) + ' / ' + (position % 3 + 1);
      side.append(pip);
    }
    cube.append(side);
  }
  stage.append(cube);
  die.replaceChildren(shadow, stage);
  return cube;
}

export const credits = amount => number.format(amount) + ' TC';

export function playerFields(container, roster, count) {
  const clearError = () => container.dispatchEvent(new Event('input', { bubbles: true }));
  container.replaceChildren(...roster.slice(0, count).map((player, index) => {
    const row = node('div', 'player-row');
    const marker = token({ color: player.color, id: index + 1 });

    const nameField = node('label', 'player-field');
    nameField.append(node('span', 'player-field-label', 'Name'));
    const name = node('input');
    name.type = 'text';
    name.maxLength = 20;
    name.autocomplete = 'off';
    name.value = player.name;
    name.setAttribute('aria-label', 'Player ' + (index + 1) + ' name');
    name.addEventListener('input', () => { player.name = name.value; });
    nameField.append(name);

    const typeField = node('div', 'player-field');
    typeField.append(node('span', 'player-field-label', 'Type'));
    const typeGroup = node('div', 'type-toggle');
    typeGroup.setAttribute('role', 'group');
    typeGroup.setAttribute('aria-label', 'Player ' + (index + 1) + ' type');
    const typeButtons = [['human', 'Human'], ['ai', 'CPU']].map(([value, label]) => {
      const btn = node('button', '', label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(player.type === value));
      btn.addEventListener('click', () => {
        player.type = value;
        for (const [b, v] of typeButtons) b.setAttribute('aria-pressed', String(v === value));
        clearError();
      });
      typeGroup.append(btn);
      return [btn, value];
    });
    typeField.append(typeGroup);

    const colorField = node('div', 'player-field');
    colorField.append(node('span', 'player-field-label', 'Token'));
    const swatchGroup = node('div', 'color-swatches');
    swatchGroup.setAttribute('role', 'group');
    swatchGroup.setAttribute('aria-label', 'Player ' + (index + 1) + ' color');
    const swatches = Object.entries(PLAYER_COLORS).map(([colorName, hex]) => {
      const swatch = node('button', 'swatch');
      swatch.type = 'button';
      swatch.style.setProperty('--swatch-color', hex);
      swatch.setAttribute('aria-label', colorName[0].toUpperCase() + colorName.slice(1));
      swatch.setAttribute('aria-pressed', String(player.color === colorName));
      swatch.addEventListener('click', () => {
        player.color = colorName;
        setTokenColor(marker, colorName);
        for (const [s, c] of swatches) s.setAttribute('aria-pressed', String(c === colorName));
        clearError();
      });
      swatchGroup.append(swatch);
      return [swatch, colorName];
    });
    colorField.append(swatchGroup);

    row.append(marker, nameField, typeField, colorField);
    return row;
  }));
}

export function paintCity(data) {
  const tiles = [
    ['124', 222, 6], ['031', 310, 48], ['015', 133, 44],
    ['116', 222, 88], ['109', 347, 108], ['100', 84, 102],
    ['123', 137, 131], ['117', 272, 142], ['008', 208, 182],
  ];
  byId('city').replaceChildren(...tiles.map(([id, left, top]) => {
    const image = art(data.assets[id]);
    // The replacement keeps its city coordinates when an image is unavailable.
    const wrapper = node('div', 'city-site');
    wrapper.style.left = left + 'px';
    wrapper.style.top = top + 'px';
    wrapper.append(image);
    return wrapper;
  }));
}

function stats(entries, className = '') {
  const list = node('dl', className);
  for (const [label, value] of entries) {
    const item = node('div');
    item.append(node('dt', '', label), node('dd', '', value));
    list.append(item);
  }
  return list;
}

export function renderPanels(game) {
  const playerList = byId('player-list');
  const oldDetails = new Set([...playerList.querySelectorAll('details[open]')].map(detail => detail.dataset.player));
  const oldFocus = document.activeElement;
  const focusedPlayer = playerList.contains(oldFocus) ? oldFocus.closest('details')?.dataset.player : null;
  playerList.replaceChildren(...game.players.map(player => {
    const active = player === game.current && game.phase !== Phase.GAME_OVER;
    const card = node('article', 'player-card' + (active ? ' current' : ''));
    const header = node('header');
    header.append(token(player), node('strong', '', player.name),
      node('small', '', player.bankrupt ? 'Exited' : active ? 'Current turn' : player.type === 'ai' ? 'Computer' : 'Human'));
    const owned = portfolio(game, player);
    const details = node('details');
    details.dataset.player = player.id;
    details.open = oldDetails.has(String(player.id));
    const summary = node('summary', '', owned.length + (owned.length === 1 ? ' site' : ' sites'));
    const list = node('ul');
    for (const property of owned) {
      list.append(node('li', '', property.shortName + ' · Lv' + game.properties[property.id].level));
    }
    details.append(summary, list);
    card.append(header, stats([['Cash', credits(player.cash)], ['Total assets', credits(player.cash + assetValue(game, player))]]));
    if (owned.length) card.append(details);
    const effects = game.effects.filter(effect => effect.ownerId === player.id || effect.partnerId === player.id);
    for (const effect of effects) {
      card.append(node('p', '', game.propertyById[effect.propertyId].shortName + ' · ' + effectSummary(effect)));
    }
    return card;
  }));
  if (focusedPlayer) playerList.querySelector('[data-player="' + focusedPlayer + '"] summary')?.focus({ preventScroll: true });

  const log = byId('log');
  if (Number(log.dataset.count) !== game.log.length) {
    log.dataset.count = game.log.length;
    log.replaceChildren(...[...game.log].reverse().map(({ round, text }) => {
      const item = node('li');
      item.append(node('small', '', 'R' + round), document.createTextNode(text));
      return item;
    }));
    log.scrollTop = 0;
  }
}

export function renderTurn(game, rolling = false) {
  const ai = game.current.type === 'ai';
  const die = byId('die');
  const cube = ensureDieCube(die);
  const face = game.lastRoll ?? 0;
  if (face === 0) {
    if (die.dataset.face !== '0') {
      die.dataset.face = '0';
      dieSpins = 0;
      cube.style.transform = 'rotateX(-24deg) rotateY(30deg)';
    }
  } else if (rolling) {
    die.dataset.face = String(face);
    dieSpins += 1;
    const [rx, ry] = faceRotations[face];
    const spinX = dieSpins * 360 + rx;
    const spinY = dieSpins * 720 + ry;
    die.classList.remove('rolling');
    void die.offsetWidth;
    die.classList.add('rolling');
    cube.style.transform = 'rotateX(' + spinX + 'deg) rotateY(' + spinY + 'deg)';
  } else if (die.dataset.face !== String(face)) {
    die.dataset.face = String(face);
    const [rx, ry] = faceRotations[face];
    const spinX = dieSpins * 360 + rx;
    const spinY = dieSpins * 720 + ry;
    cube.style.transform = 'rotateX(' + spinX + 'deg) rotateY(' + spinY + 'deg)';
  }
  if (!rolling) die.classList.remove('rolling');
  die.setAttribute('aria-label', game.lastRoll ? 'Rolled ' + game.lastRoll : 'Die not rolled');
  byId('round-label').textContent = 'Round ' + game.round + ' / ' + game.data.rules.maxRounds;
  byId('turn-player').textContent = game.phase === Phase.GAME_OVER ? 'Game complete' : game.current.name + (ai ? ' · Computer' : '');
  const messages = {
    [Phase.AWAIT_ROLL]: ai ? 'The computer will roll.' : 'Roll once to move around the district.',
    [Phase.MOVING]: 'Moving to the next site…',
    [Phase.RESOLVING]: 'Resolving the landing…',
    [Phase.AWAIT_DECISION]: 'A site or event is being resolved.',
    [Phase.TURN_END]: game.log.at(-1).text,
    [Phase.GAME_OVER]: 'The final standings are ready.',
  };
  const status = byId('turn-status');
  if (status.textContent !== messages[game.phase]) status.textContent = messages[game.phase];
  const button = byId('turn-button');
  const labels = {
    [Phase.MOVING]: 'Moving…', [Phase.RESOLVING]: 'Resolving…',
    [Phase.AWAIT_DECISION]: 'Decision pending', [Phase.TURN_END]: 'End turn',
    [Phase.GAME_OVER]: 'View results',
  };
  const label = labels[game.phase] ?? 'Roll die';
  if (button.textContent !== label) {
    button.textContent = label;
  }
  button.disabled = game.phase !== Phase.GAME_OVER && (ai || ![Phase.AWAIT_ROLL, Phase.TURN_END].includes(game.phase));
}

export function button(label, action, { primary = false, disabled = false } = {}) {
  const item = node('button', primary ? 'primary' : 'secondary', label);
  item.type = 'button';
  item.disabled = disabled;
  item.addEventListener('click', action);
  return item;
}

export function actions(...buttons) {
  const row = node('div', 'dialog-actions');
  row.append(...buttons);
  return row;
}

function sources(data, ids) {
  const details = node('details');
  const links = node('ul');
  for (const id of new Set(ids)) {
    const { title, url } = data.sources[id];
    const link = node('a', '', title);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const item = node('li');
    item.append(link);
    links.append(item);
  }
  details.append(node('summary', '', 'Sources'), links);
  return details;
}

function scienceBox(text) {
  const box = node('section', 'science-box');
  box.append(node('h3', '', 'The science'), node('p', '', text));
  return box;
}

export function showDialog(settings) {
  const modal = byId('dialog');
  if (settings.category) modal.dataset.category = settings.category;
  else delete modal.dataset.category;
  const body = node('div', 'dialog-content');
  const title = node('h2', '', settings.title);
  title.id = 'dialog-title';
  title.tabIndex = -1;
  body.append(node('p', 'eyebrow', settings.label), title, ...settings.content);
  modal.replaceChildren(body);
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  title.focus({ preventScroll: true });
}

export function propertyContent(game, id) {
  const definition = game.propertyById[id];
  const state = game.properties[id];
  const owner = game.players.find(player => player.id === state.ownerId);
  const site = node('div', 'site-detail-head');
  const level = state.level >= game.data.rules.maxLevel ? 'Fully upgraded' : credits(definition.upgradeCost);
  site.append(art(game.data.assets[definition.assetId]),
    node('p', '', (owner ? 'Owned by ' + owner.name : 'Unowned') + ' · Level ' + state.level));
  const status = game.effects.filter(effect => effect.propertyId === id).map(effect => node('p', '', effectSummary(effect)));
  return {
    title: definition.name, label: categoryNames[definition.category], category: definition.category,
    content: [site, stats([['Price', credits(definition.price)], ['Current rent', credits(rentFor(game, id))],
      ['Upgrade cost', level]], 'site-stats'), ...status,
    scienceBox(definition.scienceText), sources(game.data, definition.sourceIds)],
  };
}

export function tileContent(game, tile) {
  if (tile.propertyId) return propertyContent(game, tile.propertyId);
  return { title: tile.label, label: 'District map', content: [node('p', '', specialTiles[tile.type].description(game.data.rules))] };
}

export function decisionContent(game, act) {
  const { pending, current } = game;
  const ai = current.type === 'ai';
  if (pending.kind === 'event') {
    const { card, stage, question, message } = pending;
    const content = [node('p', '', card.description)];
    if (message) content.push(node('p', 'result-box', message));
    if (stage === 'quiz') {
      content.push(node('p', 'quiz-box', question.claim));
    } else if (question) {
      content.push(node('p', 'quiz-box', question.explanation));
    }
    content.push(scienceBox(card.scienceText), sources(game.data, [...card.sourceIds, ...(question?.sourceIds ?? [])]));
    if (!ai) {
      const choices = stage === 'quiz' ? [['False', 'false'], ['True', 'true']] :
        stage === 'risk' ? [['Pass', 'pass'], ['Take the wager', 'take']] : [['Continue', 'continue']];
      content.push(actions(...choices.map(([label, value], index) =>
        button(label, () => act(value), { primary: index === choices.length - 1 }))));
    } else {
      content.push(node('p', 'muted', current.name + ' is resolving this event.'));
    }
    return { title: card.name, label: 'Quantum event', category: 'event', content };
  }

  const settings = propertyContent(game, pending.propertyId);
  if (pending.message) settings.content.push(node('p', 'result-box', pending.message));
  if (ai) {
    settings.content.push(node('p', 'muted', current.name + ' is resolving this site.'));
  } else if (pending.kind === 'site') {
    settings.content.push(actions(button('Continue', () => act('continue'), { primary: true })));
  } else {
    const affordable = current.cash >= pending.cost;
    const label = pending.kind === 'buy' ? 'Buy site' : 'Upgrade site';
    if (!affordable) settings.content.push(node('p', 'form-error', 'You need ' + credits(pending.cost) + '. You have ' + credits(current.cash) + '.'));
    settings.content.push(actions(button('Pass', () => act('pass')),
      button(label + ' · ' + credits(pending.cost), () => act('accept'), { primary: true, disabled: !affordable })));
  }
  return settings;
}

export function rulesContent(rules) {
  const steps = [
    'Set up two to four players, including at least one human. Each player starts with ' + credits(rules.initialCash) + '.',
    'Roll one die on your turn. Passing or landing on Start gives you ' + credits(rules.startBonus) + '. Only the final tile resolves.',
    'On an unowned site, buy or pass. On your own site, you can pay for one upgrade, up to level ' + rules.maxLevel + '. On an opponent’s site, pay rent. Rent multipliers by level are ' + rules.rentMultipliers.join('×, ') + '×.',
    'Research grants pay ' + credits(rules.grant) + '. Maintenance costs ' + credits(rules.maintenance) + '. Rest has no effect. Quantum Events draw from a shuffled deck.',
    'If you cannot make a required payment, the bank buys your sites in board order at ' + Math.round(rules.liquidationRate * 100) + '% of their book value. If that falls short, pay what you can and exit.',
    'The final active player wins. After ' + rules.maxRounds + ' rounds, rank active players by cash plus site prices and paid upgrades. Equal scores share a rank.',
  ];
  const list = node('ol');
  list.append(...steps.map(text => node('li', '', text)));
  return { title: 'How to play', label: 'Game rules', content: [list] };
}

export function guideContent(data) {
  const entries = [...data.properties, ...data.events];
  const details = entries.map(entry => {
    const item = node('details');
    item.append(node('summary', '', entry.name), scienceBox(entry.scienceText), sources(data, entry.sourceIds));
    return item;
  });
  return { title: 'Field guide', label: 'Quantum information', content: [
    node('p', '', 'Explore the science behind the properties and event cards.'), ...details,
  ] };
}

export function resultsContent(game, finish, close) {
  const { winners, scores, reason } = game.result;
  const title = winners.length === 0 ? 'No winner' :
    winners.length === 1 ? winners[0].player.name + ' wins!' : 'Shared victory';
  const message = reason === 'round-limit' ? 'The round limit was reached. Active players are ranked by total assets.' :
    winners.length ? 'The final active player wins.' : 'All players have exited.';
  const table = node('table', 'result-table');
  const head = node('thead');
  const header = node('tr');
  for (const text of ['Rank', 'Player', 'Cash', 'Sites', 'Total']) {
    const cell = node('th', '', text);
    cell.scope = 'col';
    header.append(cell);
  }
  head.append(header);
  const body = node('tbody');
  for (const score of scores) {
    const row = node('tr');
    for (const value of [score.rank ?? 'Exited', score.player.name, credits(score.cash), credits(score.sites), credits(score.total)]) {
      row.append(node('td', '', value));
    }
    body.append(row);
  }
  table.append(head, body);
  return { title, label: 'Final standings', content: [
    node('p', '', message), table, actions(button('View board', close), button('Play again', finish, { primary: true })),
  ] };
}
