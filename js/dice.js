export function rollDie(random = Math.random) {
  return 1 + Math.floor(random() * 6);
}

export function shuffle(items, random = Math.random) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
