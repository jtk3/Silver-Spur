(() => {
  'use strict';
  const baseURL = new URL('.', document.currentScript.src);
  const jacksEntries = [
    ['straightFlush', 'Straight flush', 50],
    ['fourKind', 'Four of a kind', 25],
    ['fullHouse', 'Full house', 9],
    ['flush', 'Flush', 6],
    ['straight', 'Straight', 4],
    ['threeKind', 'Three of a kind', 3],
    ['twoPair', 'Two pair', 2],
    ['jacks', 'Jacks or better', 1],
  ];
  const deucesEntries = [
    ['fourDeuces', 'Four deuces', 200],
    ['wildRoyal', 'Wild royal flush', 25],
    ['fiveKind', 'Five of a kind', 15],
    ['straightFlush', 'Straight flush', 9],
    ['fourKind', 'Four of a kind', 5],
    ['fullHouse', 'Full house', 3],
    ['flush', 'Flush', 2],
    ['straight', 'Straight', 2],
    ['threeKind', 'Three of a kind', 1],
  ];
  const doubleDoubleEntries = [
    ['straightFlush', 'Straight flush', 50],
    ['fourAcesKicker', 'Four aces + 2–4', 400],
    ['fourLowKicker', 'Four 2–4 + A–4', 160],
    ['fourAces', 'Four aces + 5–K', 160],
    ['fourLow', 'Four 2–4 + 5–K', 80],
    ['fourKind', 'Four 5–K', 50],
    ['fullHouse', 'Full house', 10],
    ['flush', 'Flush', 6],
    ['straight', 'Straight', 4],
    ['threeKind', 'Three of a kind', 3],
    ['twoPair', 'Two pair', 1],
    ['jacks', 'Jacks or better', 1],
  ];

  // Rejection sampling keeps every integer equiprobable, including on the royal bonus.
  function randomBelow(bound) {
    if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000) {
      throw new RangeError('Invalid random range');
    }
    const word = new Uint32Array(1);
    const limit = 0x100000000 - (0x100000000 % bound);
    do { crypto.getRandomValues(word); } while (word[0] >= limit);
    return word[0] % bound;
  }

  // Cards use rank * 4 + suit, starting at the deuce.
  function evaluateNatural(cards, doubleDouble = false) {
    const ranks = cards.map(card => Math.floor(card / 4)).sort((a, b) => a - b);
    const flush = cards.every(card => card % 4 === cards[0] % 4);
    const groups = [];
    for (let i = 0; i < 5;) {
      let end = i + 1;
      while (end < 5 && ranks[end] === ranks[i]) end++;
      groups.push({ rank: ranks[i], count: end - i });
      i = end;
    }
    if (groups.length === 5) {
      const broadway = ranks[0] === 8 && ranks[4] === 12;
      const straight = ranks[4] - ranks[0] === 4 ||
        (ranks[0] === 0 && ranks[3] === 3 && ranks[4] === 12);
      if (straight && flush) return broadway ? 'royal' : 'straightFlush';
      if (flush) return 'flush';
      if (straight) return 'straight';
      return 'nothing';
    }
    const largest = Math.max(...groups.map(group => group.count));
    if (largest === 4) {
      if (!doubleDouble) return 'fourKind';
      const quad = groups.find(group => group.count === 4).rank;
      const kicker = groups.find(group => group.count === 1).rank;
      if (quad === 12) return kicker <= 2 ? 'fourAcesKicker' : 'fourAces';
      if (quad <= 2) return kicker <= 2 || kicker === 12 ? 'fourLowKicker' : 'fourLow';
      return 'fourKind';
    }
    if (groups.length === 2) return 'fullHouse';
    if (largest === 3) return 'threeKind';
    if (groups.length === 3) return 'twoPair';
    return groups.some(group => group.count === 2 && group.rank >= 9) ? 'jacks' : 'nothing';
  }

  const royalRanks = 0b1111100000000;
  const straightRanks = [0b1000000001111, ...Array.from({ length: 9 }, (_, i) => 0b11111 << i)];
  function evaluateDeuces(cards) {
    const natural = cards.filter(card => card >= 4);
    const wild = 5 - natural.length;
    if (wild === 4) return 'fourDeuces';

    const rankCounts = new Map();
    let rankMask = 0;
    for (const card of natural) {
      const rank = Math.floor(card / 4);
      rankMask |= 1 << rank;
      rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    }
    const flush = natural.every(card => card % 4 === natural[0] % 4);
    const straight = rankCounts.size === natural.length &&
      straightRanks.some(mask => (rankMask & mask) === rankMask);
    const largest = Math.max(...rankCounts.values()) + wild;
    if (flush && (rankMask & royalRanks) === rankMask) return wild ? 'wildRoyal' : 'royal';
    if (largest === 5) return 'fiveKind';
    if (flush && straight) return 'straightFlush';
    if (largest === 4) return 'fourKind';
    // If the cards need only two ranks and four of a kind is impossible, the wilds can fill a full house.
    if (rankCounts.size === 2) return 'fullHouse';
    if (flush) return 'flush';
    if (straight) return 'straight';
    return largest === 3 ? 'threeKind' : 'nothing';
  }

  const choose = Array.from({ length: 53 }, () => Array(6).fill(0));
  for (let n = 0; n <= 52; n++) {
    choose[n][0] = 1;
    for (let k = 1; k <= Math.min(n, 5); k++) {
      choose[n][k] = choose[n - 1][k] + choose[n - 1][k - 1];
    }
  }

  async function loadHintTable(filename) {
    const response = await fetch(new URL(filename, baseURL));
    if (!response.ok) throw new Error('The hold guide could not load.');
    const packed = new Uint8Array(await response.arrayBuffer());
    const decoded = new Uint8Array(choose[52][5]);
    let input = 0, output = 0;
    while (input < packed.length) {
      const tag = packed[input++];
      if (tag < 128) {
        const count = tag + 1;
        if (input + count > packed.length || output + count > decoded.length) throw new Error('Invalid hold guide');
        decoded.set(packed.subarray(input, input + count), output);
        input += count;
        output += count;
      } else {
        const count = tag - 128 + 3;
        if (input >= packed.length || output + count > decoded.length) throw new Error('Invalid hold guide');
        decoded.fill(packed[input++], output, output + count);
        output += count;
      }
    }
    if (output !== decoded.length) throw new Error('Incomplete hold guide');
    return decoded;
  }

  function createVariant({ calibration, entries, evaluate, filename, royalName = 'Royal flush' }) {
    const rows = [['royal', royalName, calibration.royalLow, calibration.royalLow + 1], ...entries];
    const paytable = Object.freeze(rows.map(([key, name, units, maxUnits = units]) =>
      Object.freeze({ key, name, units, maxUnits })));
    const awards = new Map(paytable.map(row => [row.key, row.units]));
    const upperNumerator = Number(calibration.upperNumerator);
    const upperDenominator = Number(calibration.upperDenominator);

    function payout(key, bet) {
      if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('Invalid wager');
      if (key === 'nothing') return 0;
      if (!awards.has(key)) throw new RangeError('Unknown hand');
      const boost = key === 'royal' && randomBelow(upperDenominator) < upperNumerator;
      return (awards.get(key) + Number(boost)) * bet;
    }

    let hintTablePromise;
    // The returned mask uses the original on-screen card order.
    async function bestHold(cards) {
      if (!hintTablePromise) hintTablePromise = loadHintTable(filename).catch(error => {
        hintTablePromise = undefined;
        throw error;
      });
      const table = await hintTablePromise;
      const order = [0, 1, 2, 3, 4].sort((a, b) => cards[a] - cards[b]);
      const ordinal = order.reduce((sum, pos, i) => sum + choose[cards[pos]][i + 1], 0);
      const sortedHold = table[ordinal];
      return order.reduce((mask, pos, i) => mask | (((sortedHold >> i) & 1) << pos), 0);
    }

    return Object.freeze({ calibration, evaluate, payout, bestHold, paytable });
  }
  const jacks = createVariant({
    calibration: globalThis.SilverSpurCalibration, entries: jacksEntries, filename: 'holds.bin',
    evaluate: cards => evaluateNatural(cards),
  });
  const deuces = createVariant({
    calibration: globalThis.SilverSpurDeucesCalibration, entries: deucesEntries, filename: 'deuces-holds.bin',
    evaluate: evaluateDeuces, royalName: 'Natural royal flush',
  });
  const doubleDouble = createVariant({
    calibration: globalThis.SilverSpurDoubleDoubleCalibration, entries: doubleDoubleEntries,
    filename: 'doubleDouble-holds.bin', evaluate: cards => evaluateNatural(cards, true),
  });
  const variants = Object.freeze({ jacks, deuces, doubleDouble });
  globalThis.SilverSpurMath = Object.freeze({ ...jacks, randomBelow, variants });
})();
