import { shuffle } from './dice.js';
import { collect, portfolio } from './property.js';

const targets = {
  owned: () => true,
  quantum: property => !['classical', 'theory'].includes(property.category),
  compute: property => property.category === 'compute',
};

export function effectSummary(effect) {
  if (effect.kind === 'share') {
    return 'Shared with ' + effect.partnerName + ' · ' + effect.remaining + ' rent payment(s) left';
  }
  return 'Rent ×' + effect.multiplier + ' · ' + effect.remaining + ' owner turn(s) left';
}

export function tickEffects(game, player) {
  for (const effect of game.effects) {
    if (effect.kind === 'modifier' && effect.ownerId === player.id && player.turns > effect.appliedOn) {
      effect.remaining -= 1;
    }
  }
  game.removeEffects(effect => effect.remaining === 0, 'expired');
}

function addSiteEffect(game, card) {
  const player = game.current;
  const property = portfolio(game, player).find(targets[card.target]);
  const partner = card.effectType === 'share' ? game.nextActive() : null;
  if (!property || (card.effectType === 'share' && !partner)) {
    return 'No eligible site or partner. There is no rent change.';
  }
  const effect = {
    cardId: card.id, kind: card.effectType, propertyId: property.id, ownerId: player.id,
    multiplier: card.multiplier, appliedOn: player.turns, remaining: card.duration,
    partnerId: partner?.id, partnerName: partner?.name,
  };
  const existing = game.effects.findIndex(item => item.cardId === card.id && item.propertyId === property.id);
  if (existing < 0) game.effects.push(effect);
  else game.effects[existing] = effect;
  return property.name + ' · ' + effectSummary(effect) + (existing < 0 ? '.' : ' (refreshed).');
}

export function drawEvent(game) {
  if (!game.deck.length) game.deck = shuffle(game.data.events, game.random);
  const card = game.deck.pop();
  const pending = { kind: 'event', card, stage: 'result', message: '' };
  const player = game.current;
  game.note(player.name + ' drew ' + card.name + '.');
  switch (card.effectType) {
    case 'share':
    case 'modifier':
      pending.message = addSiteEffect(game, card);
      break;
    case 'credit':
      player.cash += card.amount;
      pending.message = player.name + ' received ' + card.amount + ' TC.';
      break;
    case 'quiz':
      player.cash += card.amount;
      if (!game.questionDeck.length) game.questionDeck = shuffle(card.questions, game.random);
      pending.question = game.questionDeck.pop();
      pending.stage = 'quiz';
      pending.message = player.name + ' received a ' + card.amount + ' TC advance.';
      break;
    case 'risk':
      pending.stage = 'risk';
      break;
  }
  if (pending.message) game.note(pending.message);
  return pending;
}

export function resolveEvent(game, pending, choice) {
  const { stage, card, question } = pending;
  const player = game.current;
  let message;
  if (stage === 'quiz' && ['true', 'false'].includes(choice)) {
    const correct = (choice === 'true') === question.answer;
    const paid = correct ? 0 : collect(game, player, card.amount, 'advance repayment');
    message = correct ? 'Correct. You kept the ' + card.amount + ' TC advance.' :
      'Incorrect. You returned ' + paid + ' TC.';
  } else if (stage === 'risk' && ['take', 'pass'].includes(choice)) {
    if (choice === 'pass') {
      message = player.name + ' passed on the wager.';
    } else if (game.random() < card.probability) {
      player.cash += card.amount;
      message = player.name + ' gained ' + card.amount + ' TC.';
    } else {
      const paid = collect(game, player, card.loss, 'wager');
      message = player.name + ' paid ' + paid + ' TC on the wager.';
    }
  } else {
    return false;
  }
  Object.assign(pending, { stage: 'result', message });
  game.note(message);
  return true;
}
