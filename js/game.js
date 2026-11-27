import { rollDie, shuffle } from './dice.js';
import { makePlayers } from './player.js';
import { assetValue, collect, settleRent } from './property.js';
import { drawEvent, resolveEvent, tickEffects } from './events.js';

export const Phase = Object.freeze({
  SETUP: 'SETUP', AWAIT_ROLL: 'AWAIT_ROLL', MOVING: 'MOVING', RESOLVING: 'RESOLVING',
  AWAIT_DECISION: 'AWAIT_DECISION', TURN_END: 'TURN_END', GAME_OVER: 'GAME_OVER',
});

export class Game {
  constructor(data, players, random = Math.random) {
    this.phase = Phase.SETUP;
    this.data = data;
    this.random = random;
    this.players = makePlayers(players, data.rules.initialCash);
    this.propertyById = Object.fromEntries(data.properties.map(property => [property.id, property]));
    this.properties = Object.fromEntries(data.properties.map(({ id }) => [id, { propertyId: id, ownerId: null, level: 1 }]));
    this.currentIndex = 0;
    this.round = 1;
    this.deck = shuffle(data.events, random);
    this.questionDeck = [];
    this.effects = [];
    this.log = [];
    this.lastRoll = null;
    this.stepsLeft = 0;
    this.pending = null;
    this.result = null;
    this.note('The race begins. Each player starts with ' + data.rules.initialCash + ' TC.');
    this.beginTurn();
  }

  get current() { return this.players[this.currentIndex]; }

  note(text) {
    this.log.push({ round: this.round, text });
  }

  removeEffects(matches, reason) {
    this.effects = this.effects.filter(effect => {
      if (!matches(effect)) return true;
      this.note('An effect ended at ' + this.propertyById[effect.propertyId].name + ' (' + reason + ').');
      return false;
    });
  }

  nextActive() {
    for (let offset = 1; offset < this.players.length; offset += 1) {
      const candidate = this.players[(this.currentIndex + offset) % this.players.length];
      if (!candidate.bankrupt) return candidate;
    }
    return null;
  }

  beginTurn() {
    this.current.turns += 1;
    this.lastRoll = null;
    this.phase = Phase.AWAIT_ROLL;
    this.note(this.current.name + ' is up.');
  }

  roll() {
    if (this.phase !== Phase.AWAIT_ROLL) return false;
    this.lastRoll = rollDie(this.random);
    this.stepsLeft = this.lastRoll;
    this.phase = Phase.MOVING;
    this.note(this.current.name + ' rolled ' + this.lastRoll + '.');
    return true;
  }

  step() {
    if (this.phase !== Phase.MOVING) return false;
    const player = this.current;
    player.position = (player.position + 1) % this.data.board.length;
    if (player.position === 0) {
      player.cash += this.data.rules.startBonus;
      this.note(player.name + ' collected ' + this.data.rules.startBonus + ' TC at Start.');
    }
    this.stepsLeft -= 1;
    if (!this.stepsLeft) this.phase = Phase.RESOLVING;
    return true;
  }

  resolveLanding() {
    if (this.phase !== Phase.RESOLVING) return false;
    const player = this.current;
    const tile = this.data.board[player.position];
    this.note(player.name + ' landed on ' + tile.label + '.');
    switch (tile.type) {
      case 'property':
        this.landOnProperty(tile.propertyId);
        break;
      case 'event':
        this.pending = drawEvent(this);
        break;
      case 'grant':
        player.cash += this.data.rules.grant;
        this.note(player.name + ' received a ' + this.data.rules.grant + ' TC grant.');
        break;
      case 'maintenance': {
        const paid = collect(this, player, this.data.rules.maintenance, 'maintenance');
        this.note(player.name + ' paid ' + paid + ' TC for maintenance.');
        break;
      }
    }
    this.phase = this.pending ? Phase.AWAIT_DECISION : Phase.TURN_END;
    return true;
  }

  landOnProperty(propertyId) {
    const { ownerId, level } = this.properties[propertyId];
    const definition = this.propertyById[propertyId];
    if (ownerId === null) {
      this.pending = { kind: 'buy', propertyId, cost: definition.price };
    } else if (ownerId !== this.current.id) {
      const paid = settleRent(this, this.current, propertyId);
      this.pending = { kind: 'site', propertyId, message: 'Rent paid: ' + paid + ' TC.' };
    } else if (level < this.data.rules.maxLevel) {
      this.pending = { kind: 'upgrade', propertyId, cost: definition.upgradeCost };
    } else {
      this.pending = { kind: 'site', propertyId, message: 'This site is fully upgraded.' };
    }
  }

  decide(choice) {
    if (this.phase !== Phase.AWAIT_DECISION) return false;
    const pending = this.pending;
    if (pending.kind === 'event') {
      if (pending.stage !== 'result') return resolveEvent(this, pending, choice);
      if (choice !== 'continue') return false;
    } else if (pending.kind === 'site') {
      if (choice !== 'continue') return false;
    } else {
      if (choice !== 'accept' && choice !== 'pass') return false;
      if (choice === 'accept') {
        if (this.current.cash < pending.cost) return false;
        const property = this.properties[pending.propertyId];
        const name = this.propertyById[pending.propertyId].name;
        const buying = pending.kind === 'buy';
        this.current.cash -= pending.cost;
        if (buying) property.ownerId = this.current.id;
        else property.level += 1;
        this.note(this.current.name + (buying ? ' acquired ' : ' upgraded ') + name + ' for ' + pending.cost + ' TC.');
      } else {
        this.note(this.current.name + ' passed on the ' + (pending.kind === 'buy' ? 'purchase.' : 'upgrade.'));
      }
    }
    this.pending = null;
    this.phase = Phase.TURN_END;
    return true;
  }

  endTurn() {
    if (this.phase !== Phase.TURN_END) return false;
    tickEffects(this, this.current);
    const active = this.players.filter(player => !player.bankrupt);
    const next = this.nextActive();
    const wraps = next && this.players.indexOf(next) <= this.currentIndex;
    if (active.length <= 1 || (wraps && this.round >= this.data.rules.maxRounds)) {
      this.finish(active.length <= 1 ? 'survival' : 'round-limit');
      return true;
    }
    if (wraps) this.round += 1;
    this.currentIndex = this.players.indexOf(next);
    this.beginTurn();
    return true;
  }

  finish(reason) {
    const scores = this.players.map(player => {
      const sites = assetValue(this, player);
      return { player, cash: player.cash, sites, total: player.cash + sites };
    });
    scores.sort((a, b) => Number(a.player.bankrupt) - Number(b.player.bankrupt) || b.total - a.total);
    scores.forEach((score, index) => {
      if (score.player.bankrupt) score.rank = null;
      else score.rank = index > 0 && scores[index - 1].total === score.total ? scores[index - 1].rank : index + 1;
    });
    this.result = { reason, scores, winners: scores.filter(score => score.rank === 1) };
    this.phase = Phase.GAME_OVER;
    this.note('The game ended after round ' + this.round + '.');
  }
}
