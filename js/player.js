export const PLAYER_COLORS = {
  violet: '#643ac5',
  blue: '#2362c7',
  teal: '#08776f',
  coral: '#b33f54',
};

export function validatePlayers(players) {
  if (players.length < 2 || players.length > 4) return 'Choose between two and four players.';
  if (players.some(({ name }) => !name.trim() || name.trim().length > 20)) {
    return 'Enter a name of 1–20 characters for each player.';
  }
  if (new Set(players.map(({ name }) => name.trim().toLowerCase())).size !== players.length) {
    return 'Give each player a different name.';
  }
  const colors = players.map(({ color }) => color);
  if (colors.some(color => !Object.hasOwn(PLAYER_COLORS, color)) || new Set(colors).size !== players.length) {
    return 'Choose a different color for each player.';
  }
  if (players.some(({ type }) => type !== 'human' && type !== 'ai') ||
      !players.some(({ type }) => type === 'human')) return 'Choose at least one human player.';
  return '';
}

export function makePlayers(config, initialCash) {
  const error = validatePlayers(config);
  if (error) throw new Error(error);
  return config.map(({ name, color, type }, index) => ({
    id: index + 1, name: name.trim(), color, type, cash: initialCash, position: 0, turns: 0, bankrupt: false,
  }));
}
