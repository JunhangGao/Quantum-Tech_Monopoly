export function computerChoice(game) {
  const action = game.pending;
  if (action.kind === 'buy' || action.kind === 'upgrade') {
    return game.current.cash - action.cost >= game.data.rules.aiReserve ? 'accept' : 'pass';
  }
  if (action.stage === 'quiz') return game.random() < 0.5 ? 'true' : 'false';
  if (action.stage === 'risk') {
    return game.current.cash >= game.data.rules.aiReserve + action.card.loss ? 'take' : 'pass';
  }
  return 'continue';
}
