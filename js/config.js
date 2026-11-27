const files = ['board', 'properties', 'events', 'rules', 'sources', 'assets'];

function assert(valid, description) {
  if (!valid) throw new Error('Invalid ' + description + '.');
}

export function validateData(data) {
  const { board, properties, events, rules, sources, assets } = data;
  const money = value => Number.isSafeInteger(value) && value >= 0;
  const idSet = records => new Set(records.map(({ id }) => id));
  const types = { property: 16, event: 4, start: 1, grant: 1, maintenance: 1, rest: 1 };
  assert(Array.isArray(board) && board.length === 24 && idSet(board).size === 24 &&
    board[0].type === 'start' && board.every((tile, index) =>
      tile.index === index && Object.hasOwn(types, tile.type) && tile.label), 'board layout');
  for (const [type, count] of Object.entries(types)) {
    assert(board.filter(tile => tile.type === type).length === count, 'board tile count for ' + type);
  }
  assert(rules && ['initialCash', 'startBonus', 'maxRounds', 'maxLevel', 'grant', 'maintenance', 'aiReserve']
    .every(key => money(rules[key])) && rules.maxRounds > 0 && rules.maxLevel > 0 &&
    Array.isArray(rules.rentMultipliers) && rules.rentMultipliers.length === rules.maxLevel &&
    rules.rentMultipliers.every(value => Number.isFinite(value) && value >= 0) &&
    Number.isFinite(rules.liquidationRate) && rules.liquidationRate >= 0 && rules.liquidationRate <= 1, 'rules');
  const cited = record => Array.isArray(record.sourceIds) && record.sourceIds.length > 0 &&
    record.sourceIds.every(id => sources?.[id]?.title && /^https:\/\//.test(sources[id].url));
  assert(Array.isArray(properties) && properties.length === 16 && idSet(properties).size === 16 &&
    properties.every(property => property.id && property.name && property.shortName && property.scienceText &&
      ['classical', 'sensing', 'comms', 'compute', 'research', 'theory'].includes(property.category) &&
      [property.price, property.baseRent, property.upgradeCost].every(money) && cited(property)), 'property data');
  const boardProperties = board.filter(tile => tile.type === 'property').map(tile => tile.propertyId);
  assert(boardProperties.every((id, index) => id === properties[index].id), 'property board order');
  const effectTypes = { share: 1, modifier: 2, credit: 1, quiz: 1, risk: 1 };
  assert(Array.isArray(events) && events.length === 6 && idSet(events).size === 6 &&
    events.every(event => event.id && event.name && event.description && event.scienceText &&
      Object.hasOwn(effectTypes, event.effectType) && cited(event)), 'event data');
  for (const [type, count] of Object.entries(effectTypes)) {
    assert(events.filter(event => event.effectType === type).length === count, 'event count for ' + type);
  }
  for (const event of events) {
    if (['share', 'modifier'].includes(event.effectType)) {
      assert(Number.isSafeInteger(event.duration) && event.duration > 0 &&
        ['owned', 'quantum', 'compute'].includes(event.target), 'duration or target for ' + event.name);
    }
    if (event.effectType === 'modifier') {
      assert(Number.isFinite(event.multiplier) && event.multiplier >= 0, 'multiplier for ' + event.name);
    }
    if (['credit', 'quiz', 'risk'].includes(event.effectType)) assert(money(event.amount), 'award for ' + event.name);
    if (event.effectType === 'risk') {
      assert(money(event.loss) && Number.isFinite(event.probability) && event.probability >= 0 && event.probability <= 1, 'wager');
    }
    if (event.effectType === 'quiz') {
      assert(Array.isArray(event.questions) && event.questions.length >= 3 &&
        event.questions.every(question => question.claim && question.explanation &&
          typeof question.answer === 'boolean' && cited(question)), 'quiz questions');
    }
  }
  assert(assets && Object.values(assets).every(path => typeof path === 'string' && path.startsWith('assets/')), 'asset paths');
  return data;
}

export async function loadData() {
  const entries = await Promise.all(files.map(async name => {
    const response = await fetch('data/' + name + '.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load ' + name + '.json (HTTP ' + response.status + ').');
    try {
      return [name, await response.json()];
    } catch {
      throw new Error('Could not read ' + name + '.json.');
    }
  }));
  return validateData(Object.fromEntries(entries));
}
