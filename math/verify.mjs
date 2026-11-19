// Run from any directory with Node 18+. Checks the shipped browser rules and strategy bytes.
import fs from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const resources = new URL('../dist/math/', import.meta.url);
globalThis.document = { currentScript: { src: new URL('poker-math.js', resources).href } };
globalThis.fetch = async url => new Response(await fs.readFile(url));
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
await import(new URL('calibration.js', resources));
await import(new URL('poker-math.js', resources));
const { variants } = globalThis.SilverSpurMath;
const keys = [
  'nothing', 'jacks', 'twoPair', 'threeKind', 'straight', 'flush', 'fullHouse',
  'fourKind', 'straightFlush', 'royal', 'fourDeuces', 'wildRoyal', 'fiveKind',
  'fourAcesKicker', 'fourLowKicker', 'fourAces', 'fourLow',
];
const keyIndex = Object.fromEntries(keys.map((key, i) => [key, i]));
const histogramByGame = {
  jacks: [2062860,337920,123552,54912,10200,5108,3744,624,36,4],
  deuces: [2119728,0,0,355080,62232,14472,12672,31552,2068,4,48,480,624],
  doubleDouble: [2062860,337920,123552,54912,10200,5108,3744,432,36,4,0,0,0,12,36,36,108],
};
const startingDeals = [
  [48,44,40,36,32], // Royal
  [35,47,3,43,39],  // Four to a royal
  [51,0,5,10,15],   // Wheel
  [2,6,10,14,50],   // Straight flush, ace low
  [13,12,15,14,0],  // Quads
  [1,5,9,13,29],    // Made flush
  [0,1,2,4,5],      // Full house with natural cards, five of a kind with deuces
  [0,6,13,23,31],   // Unpaired low cards
  [49,48,2,8,20],   // High pair
  [41,10,43,33,37], // High pair and straight/royal possibilities
  [0,40,36,32,44],  // Wild royal
  [0,1,2,3,48],     // Four deuces
  [0,1,2,20,46],    // Three wilds with mixed ranks
  [48,49,50,51,10], // Four aces with a qualifying kicker
  [4,5,6,7,51],     // Four threes with an ace kicker
  [8,9,10,11,13],   // Four fours with a nonqualifying kicker
];

let seed = 18411;
function step(bound) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor(seed / 2**32 * bound);
}
for (let i = 0; i < 32; i++) {
  const deck = Array.from({ length: 52 }, (_, k) => k);
  for (let k = 0; k < 5; k++) {
    const j = k + step(52-k);
    [deck[k],deck[j]] = [deck[j],deck[k]];
  }
  startingDeals.push(deck.slice(0,5));
}

// Enumerate assignments to the wild cards on representative deals, including three wilds.
// This calculates the highest possible fixed award by evaluating ordinary substituted hands.
function bestBySubstitution(cards) {
  const indices = cards.flatMap((card, i) => card < 4 ? [i] : []);
  if (indices.length === 4) return 200;
  const hand = [...cards];
  if (indices.length === 0 && variants.jacks.evaluate(hand) === 'royal') return 906;
  const ordinaryPay = { straightFlush: 9, fourKind: 5, fullHouse: 3, flush: 2, straight: 2, threeKind: 1 };
  function search(wildIndex) {
    if (wildIndex === indices.length) {
      if (hand.every(card => (card >> 2) === (hand[0] >> 2))) return 15;
      const ordinary = variants.jacks.evaluate(hand);
      if (ordinary === 'royal') return 25;
      return ordinaryPay[ordinary] ?? 0;
    }
    let top = 0;
    for (let card = 0; card < 52; card++) {
      // Duplicates are necessary for five of a kind. Reject other duplicate assignments
      // at the leaf so they cannot be mistaken for an ordinary full house or flush.
      hand[indices[wildIndex]] = card;
      if (wildIndex === indices.length - 1 && new Set(hand).size < 5 &&
          !hand.every(value => (value >> 2) === (hand[0] >> 2))) continue;
      top = Math.max(top, search(wildIndex + 1));
    }
    return top;
  }
  return search(0);
}
const deucesPay = new Map(variants.deuces.paytable.map(row => [row.key, row.units]));
deucesPay.set('nothing', 0);
for (const cards of startingDeals) {
  assert.equal(deucesPay.get(variants.deuces.evaluate(cards)), bestBySubstitution(cards), 'Deuces substitution on ' + cards);
}

function verifyQuadKickers() {
  const game = variants.doubleDouble;
  for (let rank = 0; rank < 13; rank++) {
    const quads = [rank*4, rank*4+1, rank*4+2, rank*4+3];
    for (let kicker = 0; kicker < 13; kicker++) {
      if (kicker === rank) continue;
      let award = 50;
      if (rank === 12) award = [0,1,2].includes(kicker) ? 400 : 160;
      if ([0,1,2].includes(rank)) award = [12,0,1,2].includes(kicker) ? 160 : 80;
      assert.equal(game.payout(game.evaluate([quads[3],kicker*4,quads[1],quads[0],quads[2]]), 1), award);
    }
  }
}
verifyQuadKickers();

for (const [variant, game] of Object.entries(variants)) {
  const { evaluate, paytable, payout, bestHold, calibration: cfg } = game;
  const prefix = variant === 'jacks' ? '' : variant + '-';
  const proof = JSON.parse(await fs.readFile(new URL(prefix + 'verification.json', import.meta.url), 'utf8'));
  const meanDen = BigInt(cfg.upperDenominator);
  const meanNum = BigInt(cfg.royalLow) * meanDen + BigInt(cfg.upperNumerator);
  assert.equal(100n * (BigInt(proof.nonroyalWeightedSum) * meanDen + BigInt(proof.royalWeightedFrequency) * meanNum),
    101n * BigInt(proof.weightDenominator) * meanDen);
  const highNumber = Number(cfg.upperNumerator), highDenom = Number(cfg.upperDenominator);
  assert.ok(highNumber > 0 && highDenom > highNumber && highDenom <= 2**32);

  const histogram = new Uint32Array(keys.length);
  const award = Object.fromEntries(paytable.map(row => [row.key, row.units]));
  award.royal = 0; award.nothing = 0;
  const cases = startingDeals.map(cards => {
    const bits = new Uint8Array(52);
    cards.forEach((id, i) => { bits[id] = 1 << i; });
    return { cards, bits, counts: new Uint32Array(32), fixed: new Uint32Array(32), royals: new Uint32Array(32) };
  });

  // Assign each final hand directly to its intersection with the original deal.
  // This does not use the solver's subset totals or its inclusion–exclusion step.
  let fingerprint = 2166136261;
  for (let e=4;e<52;e++) for (let d=3;d<e;d++) for (let c=2;c<d;c++)
    for (let b=1;b<c;b++) for (let a=0;a<b;a++) {
      const key = evaluate([a,b,c,d,e]);
      const index = keyIndex[key];
      histogram[index]++;
      fingerprint = Math.imul(fingerprint ^ index, 16777619) >>> 0;
      for (const item of cases) {
        const x = item.bits;
        const mask = x[a]|x[b]|x[c]|x[d]|x[e];
        item.counts[mask]++;
        item.fixed[mask] += award[key];
        item.royals[mask] += Number(key === 'royal');
      }
    }
  assert.deepEqual([...histogram], keys.map((_, i) => histogramByGame[variant][i] ?? 0));
  if (proof.classificationFingerprint !== undefined) assert.equal(fingerprint, proof.classificationFingerprint);
  const denomByHoldCount = [1533939,178365,16215,1081,47,1];
  for (const item of cases) {
    const selected = await bestHold(item.cards);
    const values = Array.from(item.fixed, (fixed,mask) => BigInt(fixed)*meanDen+BigInt(item.royals[mask])*meanNum);
    for (let mask = 0; mask < 32; mask++) {
      const count = mask.toString(2).replaceAll('0','').length;
      assert.equal(item.counts[mask], denomByHoldCount[count]);
      assert.ok(values[selected]*BigInt(item.counts[mask]) >= values[mask]*BigInt(item.counts[selected]),
        variant + ' chose a suboptimal hold for ' + item.cards);
    }
  }
  for (let bet = 1; bet <= 5; bet++) {
    assert.equal(payout('nothing', bet), 0);
    for (const row of paytable) {
      if (row.key !== 'royal') assert.equal(payout(row.key,bet), bet*row.units);
    }
  }

  // Verify the probability threshold, rejection path, and scaling at all allowed bets.
  const rng = globalThis.crypto;
  const original = rng.getRandomValues;
  const words = [];
  rng.getRandomValues = word => { assert.ok(words.length); word[0] = words.shift(); return word; };
  try {
    for (let bet = 1; bet <= 5; bet++) {
      words.push(0xffffffff, highNumber-1, highNumber);
      assert.equal(payout('royal',bet), (cfg.royalLow+1)*bet);
      assert.equal(payout('royal',bet), cfg.royalLow*bet);
    }
  } finally {
    rng.getRandomValues = original;
  }
  assert.equal(words.length,0);
  console.log(variant + ': verified 2,598,960 final hands, exact 101/100 return, all 32 holds for ' +
    cases.length + ' test deals, and both royal prizes at every bet.');
}
