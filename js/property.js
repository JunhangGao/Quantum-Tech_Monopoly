export function valueOf(definition, property) {
  return definition.price + (property.level - 1) * definition.upgradeCost;
}

export function portfolio(game, player) {
  return game.data.properties.filter(property => game.properties[property.id].ownerId === player.id);
}

export function assetValue(game, player) {
  return portfolio(game, player).reduce((value, item) => value + valueOf(item, game.properties[item.id]), 0);
}

export function rentFor(game, propertyId) {
  const definition = game.propertyById[propertyId];
  const property = game.properties[propertyId];
  const levelMultiplier = game.data.rules.rentMultipliers[property.level - 1];
  const eventMultiplier = game.effects
    .filter(effect => effect.propertyId === propertyId && effect.kind === 'modifier')
    .reduce((factor, effect) => factor * effect.multiplier, 1);
  return Math.floor(definition.baseRent * levelMultiplier * eventMultiplier);
}

// Actual payment may be smaller than the debt when the payer goes bankrupt.
export function collect(game, payer, amount, reason) {
  const { liquidationRate } = game.data.rules;
  // The order in properties.json follows the clockwise board order.
  for (const definition of portfolio(game, payer)) {
    if (payer.cash >= amount) break;
    const property = game.properties[definition.id];
    const proceeds = Math.floor(valueOf(definition, property) * liquidationRate);
    payer.cash += proceeds;
    Object.assign(property, { ownerId: null, level: 1 });
    game.removeEffects(effect => effect.propertyId === definition.id, 'site sold');
    game.note(payer.name + ' sold ' + definition.name + ' for ' + proceeds + ' TC.');
  }
  const paid = Math.min(amount, payer.cash);
  payer.cash -= paid;
  if (paid < amount) {
    payer.bankrupt = true;
    game.removeEffects(effect => effect.ownerId === payer.id || effect.partnerId === payer.id, 'player exited');
    game.note(payer.name + ' paid ' + paid + ' of ' + amount + ' TC for ' + reason + ' and exited.');
  }
  return paid;
}

export function settleRent(game, payer, propertyId) {
  const owner = game.players.find(player => player.id === game.properties[propertyId].ownerId);
  const due = rentFor(game, propertyId);
  const paid = collect(game, payer, due, 'rent');
  const share = game.effects.find(effect => effect.propertyId === propertyId && effect.kind === 'share');
  const partner = share && game.players.find(player => player.id === share.partnerId);
  const split = partner ? Math.floor(paid / 2) : 0;
  owner.cash += paid - split;
  if (partner && paid > 0) {
    partner.cash += split;
    share.remaining -= 1;
    game.note(owner.name + ' kept ' + (paid - split) + ' TC and ' + partner.name + ' received ' + split + ' TC from entanglement.');
    if (share.remaining === 0) game.removeEffects(effect => effect === share, 'rent share used');
  }
  game.note(payer.name + ' paid ' + paid + ' TC rent at ' + game.propertyById[propertyId].name + '.');
  return paid;
}
