
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { computerChoice } from '../js/ai.js';
import { validateData } from '../js/config.js';
import { rollDie } from '../js/dice.js';
import { Game, Phase } from '../js/game.js';
import { validatePlayers } from '../js/player.js';
import { assetValue, rentFor } from '../js/property.js';

const files = ['board', 'properties', 'events', 'rules', 'sources', 'assets'];
const data = validateData(Object.fromEntries(files.map(name => [
  name, JSON.parse(readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8')),
])));
const roster = [
  { name: 'Ada', color: 'violet', type: 'human' },
  { name: 'Bell', color: 'blue', type: 'ai' },
  { name: 'Curie', color: 'teal', type: 'human' },
  { name: 'Dirac', color: 'coral', type: 'ai' },
];

function create(count = 2, overrides = {}) {
  return new Game({ ...data, rules: { ...data.rules, ...overrides } }, roster.slice(0, count), () => 0);
}

function land(game, index, forcedCard) {
  game.current.position = (index + 23) % 24;
  game.random = () => 0;
  if (forcedCard) game.deck = [data.events.find(event => event.id === forcedCard)];
  assert.equal(game.roll(), true);
  assert.equal(game.step(), true);
  assert.equal(game.resolveLanding(), true);
}

function own(game, id, player = game.current, level = 1) {
  Object.assign(game.properties[id], { ownerId: player.id, level });
}

function continueRound(game) {
  if (game.pending) assert.equal(game.decide('continue'), true);
  assert.equal(game.endTurn(), true);
  while (game.phase !== Phase.GAME_OVER && game.current.id !== 1) {
    land(game, 18);
    assert.equal(game.endTurn(), true);
  }
}

test('C01 · 2–4 players and invalid setup checks', () => {
  for (const count of [2, 3, 4]) {
    const game = create(count);
    assert.equal(game.players.length, count);
    assert.equal(game.current.name, 'Ada');
    assert.equal(game.phase, Phase.AWAIT_ROLL);
    assert.ok(game.players.every(player => player.cash === 1500 && player.position === 0));
  }
  assert.match(validatePlayers(roster.map(player => ({ ...player, type: 'ai' }))), /human/);
  assert.match(validatePlayers([roster[0], { ...roster[1], name: ' ada ' }]), /different name/);
  assert.match(validatePlayers([roster[0], { ...roster[1], color: 'violet' }]), /different color/);
  assert.match(validatePlayers([roster[0], { ...roster[1], name: '  ' }]), /1–20/);
});

test('C02–C03 · wrap, Start bonus and once-only landing resolution', () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.99999), 6);
  const game = create();
  game.current.position = 22;
  game.random = () => 0.5;
  game.deck = [data.events.find(card => card.effectType === 'credit')];
  assert.ok(game.roll());
  assert.equal(game.lastRoll, 4);
  assert.equal(game.roll(), false);
  for (let i = 0; i < 4; i += 1) assert.ok(game.step());
  assert.equal(game.step(), false);
  assert.equal(game.current.position, 2);
  assert.equal(game.current.cash, 1700);
  assert.ok(game.resolveLanding());
  assert.equal(game.resolveLanding(), false);
  assert.equal(game.current.cash, 1820);
  assert.ok(game.decide('continue'));
  assert.equal(game.decide('continue'), false);
  assert.equal(game.endTurn(), true);
  assert.equal(game.endTurn(), false);
  land(game, 0);
  assert.equal(game.current.cash, 1700);
  assert.equal(game.phase, Phase.TURN_END);
});

test('C04 · buy, decline and reject a purchase without funds', () => {
  const game = create();
  land(game, 1);
  assert.equal(game.pending.kind, 'buy');
  assert.ok(game.decide('accept'));
  assert.equal(game.current.cash, 1400);
  assert.equal(game.properties.classical.ownerId, 1);
  assert.equal(game.decide('accept'), false);
  assert.ok(game.endTurn());
  land(game, 3);
  assert.ok(game.decide('pass'));
  assert.equal(game.properties.data.ownerId, null);
  assert.ok(game.endTurn());
  game.current.cash = 10;
  land(game, 4);
  assert.equal(game.decide('accept'), false);
  assert.ok(game.decide('pass'));
  assert.equal(game.current.cash, 10);
});

test('C05 · reusable upgrades stop at level three and maintain book value', () => {
  const game = create();
  own(game, 'classical');
  for (const nextLevel of [2, 3]) {
    land(game, 1);
    assert.equal(game.pending.kind, 'upgrade');
    assert.ok(game.decide('accept'));
    assert.equal(game.decide('accept'), false);
    assert.equal(game.properties.classical.level, nextLevel);
    continueRound(game);
  }
  land(game, 1);
  assert.equal(game.pending.kind, 'site');
  assert.equal(game.decide('accept'), false);
  assert.equal(game.current.cash, 1380);
  assert.equal(assetValue(game, game.current), 220);
});

test('C06 · level multiplier, combined event multipliers and odd rent share', () => {
  const game = create(3);
  const [owner, partner, payer] = game.players;
  own(game, 'classical', owner, 2);
  assert.equal(rentFor(game, 'classical'), 30);
  game.effects.push(
    { kind: 'modifier', propertyId: 'classical', multiplier: 0.5, ownerId: 1, remaining: 2 },
    { kind: 'modifier', propertyId: 'classical', multiplier: 2, ownerId: 1, remaining: 2 },
    { kind: 'share', propertyId: 'classical', ownerId: 1, partnerId: 2, remaining: 1 },
  );
  assert.equal(rentFor(game, 'classical'), 30);
  game.effects.splice(1, 1);
  game.currentIndex = 2;
  land(game, 1);
  assert.equal(payer.cash, 1485);
  assert.equal(owner.cash, 1508);
  assert.equal(partner.cash, 1507);
  assert.equal(game.effects.some(effect => effect.kind === 'share'), false);
});

test('C07 · sell assets clockwise, clear effects and skip a bankrupt player', () => {
  const game = create(3);
  own(game, 'classical', game.current, 2);
  own(game, 'data');
  game.current.cash = 0;
  game.effects.push({ kind: 'modifier', propertyId: 'classical', ownerId: 1, remaining: 2 });
  land(game, 12);
  assert.equal(game.current.cash, 0);
  assert.equal(game.properties.classical.ownerId, null);
  assert.equal(game.properties.classical.level, 1);
  assert.equal(game.properties.data.ownerId, 1);
  assert.equal(game.effects.length, 0);
  assert.ok(game.endTurn());
  land(game, 18);
  assert.ok(game.endTurn());
  land(game, 18);
  assert.ok(game.endTurn());
  game.current.cash = 5;
  own(game, 'blackhole', game.players[1]);
  const ownerCash = game.players[1].cash;
  land(game, 23);
  assert.equal(game.current.cash, 0);
  assert.equal(game.current.bankrupt, true);
  assert.equal(game.players[1].cash, ownerCash + 65);
  assert.ok(game.decide('continue'));
  assert.ok(game.endTurn());
  assert.equal(game.current.id, 2);
  land(game, 18);
  assert.ok(game.endTurn());
  land(game, 18);
  assert.ok(game.endTurn());
  assert.equal(game.current.id, 2);
  assert.equal(game.round, 3);
});

test('C08–C09 · every event, no target, refresh and expiry timing', () => {
  const game = create(3);
  land(game, 2, 'entanglement');
  assert.match(game.pending.message, /No eligible/);
  continueRound(game);
  own(game, 'compute');
  land(game, 2, 'entanglement');
  assert.equal(game.effects[0].partnerId, 2);
  assert.equal(game.effects[0].remaining, 2);
  continueRound(game);
  land(game, 2, 'decoherence');
  assert.equal(rentFor(game, 'compute'), 25);
  continueRound(game);
  assert.equal(game.effects[1].remaining, 2);
  land(game, 2, 'advantage');
  assert.equal(rentFor(game, 'compute'), 50);
  continueRound(game);
  assert.equal(game.effects[1].remaining, 1);
  assert.equal(game.effects[2].remaining, 2);
  land(game, 2, 'decoherence');
  assert.match(game.pending.message, /refreshed/);
  assert.equal(game.effects.length, 3);
  continueRound(game);
  assert.equal(game.effects[1].remaining, 2);
  const cash = game.current.cash;
  land(game, 2, 'qkd-success');
  assert.equal(game.current.cash, cash + 120);
  continueRound(game);
  assert.equal(rentFor(game, 'compute'), 25);
  land(game, 2, 'hype');
  assert.equal(game.current.cash, cash + 220);
  assert.ok(game.decide(String(!game.pending.question.answer)));
  assert.match(game.pending.message, /Incorrect/);
  assert.equal(game.current.cash, cash + 120);
  assert.equal(game.decide('false'), false);
  continueRound(game);
  assert.equal(rentFor(game, 'compute'), 50);
  land(game, 2, 'hype');
  assert.ok(game.decide(String(game.pending.question.answer)));
  assert.match(game.pending.message, /Correct/);
  assert.equal(game.current.cash, cash + 220);
  continueRound(game);
  land(game, 2, 'black-hole');
  assert.ok(game.decide('pass'));
  assert.equal(game.current.cash, cash + 220);
  continueRound(game);
  land(game, 2, 'black-hole');
  assert.ok(game.decide('take'));
  assert.equal(game.current.cash, cash + 420);
  continueRound(game);
  land(game, 2, 'black-hole');
  game.random = () => 0.9;
  assert.ok(game.decide('take'));
  assert.equal(game.current.cash, cash + 270);
});

test('C10 · twenty rounds, ties, no players and last player', () => {
  const game = create();
  for (let round = 1; round <= 20; round += 1) {
    assert.equal(game.round, round);
    for (const player of game.players) {
      assert.equal(game.current, player);
      land(game, 18);
      assert.ok(game.endTurn());
    }
  }
  assert.equal(game.phase, Phase.GAME_OVER);
  assert.deepEqual(game.result.scores.map(score => score.rank), [1, 1]);
  assert.equal(game.result.winners.length, 2);
  assert.equal(game.roll(), false);

  const lastPlayer = create(2, { initialCash: 0 });
  land(lastPlayer, 12);
  assert.ok(lastPlayer.endTurn());
  assert.equal(lastPlayer.result.winners[0].player.id, 2);

  const nobody = create(2, { initialCash: 0 });
  nobody.players[1].bankrupt = true;
  land(nobody, 12);
  assert.ok(nobody.endTurn());
  assert.equal(nobody.result.winners.length, 0);
});

test('C11 · computer respects reserve and a fresh game resets gameplay state', () => {
  const game = create();
  land(game, 18);
  assert.ok(game.endTurn());
  assert.equal(game.current.type, 'ai');
  land(game, 1);
  game.current.cash = 299;
  assert.equal(computerChoice(game), 'pass');
  game.current.cash = 300;
  assert.equal(computerChoice(game), 'accept');
  assert.ok(game.decide(computerChoice(game)));
  assert.equal(game.current.cash, 200);
  const fresh = create();
  assert.equal(fresh.properties.classical.ownerId, null);
  assert.equal(fresh.effects.length, 0);
  assert.equal(fresh.pending, null);
  assert.equal(fresh.deck.length, data.events.length);
  assert.equal(fresh.log.length, 2);
});

test('C12 · invalid config is rejected and all referenced runtime assets exist', () => {
  const invalid = structuredClone(data);
  invalid.board[0].index = 10;
  assert.throws(() => validateData(invalid), /board layout/);
  for (const path of Object.values(data.assets)) {
    assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
  }
});
