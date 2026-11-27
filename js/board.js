import { PLAYER_COLORS } from './player.js';

export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function art(path, className = 'art') {
  const fallback = () => {
    const symbol = node('span', className + ' asset-fallback', '▧');
    symbol.setAttribute('aria-hidden', 'true');
    return symbol;
  };
  if (!path) return fallback();
  const img = node('img', className);
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  img.src = path;
  return img;
}

export function token(player) {
  const marker = node('span', 'token');
  marker.setAttribute('aria-hidden', 'true');
  const figure = node('img', 'token-figure');
  figure.alt = '';
  figure.draggable = false;
  const fallback = node('span', 'token-fallback', player.id);
  figure.addEventListener('load', () => marker.classList.remove('token-unavailable'));
  figure.addEventListener('error', () => marker.classList.add('token-unavailable'));
  marker.append(figure, fallback);
  setTokenColor(marker, player.color);
  return marker;
}

export function setTokenColor(marker, color) {
  marker.style.setProperty('--token-color', PLAYER_COLORS[color]);
  marker.firstElementChild.src = new URL(`../assets/tokens/${color}.webp`, import.meta.url);
}

export const specialTiles = {
  start: { icon: '↗', description: rules => 'Collect ' + rules.startBonus + ' TC when passing or landing here after the game starts.' },
  event: { icon: '?', description: () => 'Draw a card and discover how a quantum concept affects this turn.' },
  grant: { icon: '+', description: rules => 'The bank pays you ' + rules.grant + ' TC when you land here.' },
  maintenance: { icon: '−', description: rules => 'Pay ' + rules.maintenance + ' TC to the bank when you land here.' },
  rest: { icon: '○', description: () => 'No payment or decision. End your turn when you are ready.' },
};

export const categoryNames = {
  classical: 'Classical computing', sensing: 'Sensing', comms: 'Communications',
  compute: 'Quantum computing', research: 'Research', theory: 'Theory',
};

function coordinates(index) {
  if (index < 6) return [1, index + 1];
  if (index < 12) return [index - 5, 7];
  if (index < 18) return [7, 19 - index];
  return [25 - index, 1];
}

export class BoardView {
  constructor(element, game, inspect) {
    this.element = element;
    element.querySelectorAll('.tile').forEach(tile => tile.remove());
    this.tiles = game.data.board.map(tile => {
      const [row, column] = coordinates(tile.index);
      const button = node('button', 'tile');
      button.type = 'button';
      button.style.gridArea = row + ' / ' + column;
      button.dataset.type = tile.type;
      const property = game.propertyById[tile.propertyId];
      if (property) button.dataset.category = property.category;
      const number = node('span', 'tile-num', String(tile.index).padStart(2, '0'));
      const ownerBadge = node('span', 'tile-owner');
      ownerBadge.setAttribute('aria-hidden', 'true');
      const image = property ? art(game.data.assets[property.assetId]) :
        node('span', 'tile-icon', specialTiles[tile.type].icon);
      image.setAttribute('aria-hidden', 'true');
      const detail = node('span', 'tile-detail');
      const markers = node('span', 'tokens');
      button.append(number, ownerBadge, image, node('span', 'tile-name', property?.shortName ?? tile.label), detail, markers);
      button.addEventListener('click', () => inspect(tile));
      element.append(button);
      return { button, tile, detail, ownerBadge, markers, property };
    });
  }

  render(game, follow = false) {
    const { rules } = game.data;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prevToken = follow && !reducedMotion
      ? this.element.querySelector('.token[data-player="' + game.current.id + '"]')
      : null;
    const prevRect = prevToken?.getBoundingClientRect();
    let movedToken = null;
    let landedTile = null;

    for (const { button, tile, detail, ownerBadge, markers, property } of this.tiles) {
      const state = property && game.properties[property.id];
      const owner = state && game.players.find(player => player.id === state.ownerId);
      const visitors = game.players.filter(player => !player.bankrupt && player.position === tile.index);
      const figures = visitors.map(player => {
        const marker = token(player);
        marker.dataset.player = String(player.id);
        if (player === game.current && follow) {
          marker.classList.add('moving');
          movedToken = marker;
          landedTile = button;
        }
        return marker;
      });
      markers.replaceChildren(...figures);
      button.classList.toggle('has-tokens', visitors.length > 0);
      button.classList.toggle('occupied', visitors.includes(game.current));
      button.classList.toggle('owned', Boolean(owner));

      const labels = { start: '+' + rules.startBonus + ' TC', grant: '+' + rules.grant + ' TC',
        maintenance: '−' + rules.maintenance + ' TC', event: 'Draw card', rest: 'Free space' };
      ownerBadge.textContent = owner ? 'P' + owner.id + ' ' + '▪'.repeat(state.level) : '';
      detail.textContent = owner ? 'Lv' + state.level + ' · ' + property.price + ' TC' :
        property ? property.price + ' TC' : labels[tile.type];
      if (owner) button.style.setProperty('--owner-color', PLAYER_COLORS[owner.color]);
      else button.style.removeProperty('--owner-color');
      const ownership = owner ? owner.name + ', level ' + state.level :
        property ? 'Unowned, ' + property.price + ' Tech Credits' : labels[tile.type];
      const presence = visitors.length ? ', here: ' + visitors.map(player => player.name).join(', ') : '';
      button.setAttribute('aria-label', tile.index + '. ' + tile.label + ', ' + ownership + presence);
    }

    if (follow) {
      const scroll = this.element.parentElement;
      const target = this.tiles[game.current.position].button;
      const { left, right } = target.getBoundingClientRect();
      const visible = scroll.getBoundingClientRect();
      if (right > visible.right) scroll.scrollLeft += right - visible.right + 8;
      if (left < visible.left) scroll.scrollLeft -= visible.left - left + 8;

      if (prevRect && movedToken && typeof movedToken.animate === 'function') {
        const nextRect = movedToken.getBoundingClientRect();
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          movedToken.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(1)` },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 20}px) scale(1.3)`, offset: 0.48 },
            { transform: 'translate(0, 1px) scale(1.14, 0.86)', offset: 0.84 },
            { transform: 'translate(0, 0) scale(1)' },
          ], {
            duration: 320,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          });
        }
      }
      if (landedTile && !reducedMotion) {
        landedTile.classList.remove('step-pulse');
        void landedTile.offsetWidth;
        landedTile.classList.add('step-pulse');
      }
    }
  }
}
