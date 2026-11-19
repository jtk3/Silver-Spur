'use strict';
importScripts('math/calibration.js', 'math/poker-math.js');
const variants = SilverSpurMath.variants;
function score(cards, variantName) {
  if (!Array.isArray(cards) || cards.length !== 5 || new Set(cards).size !== 5 ||
      cards.some(c => !Number.isInteger(c) || c < 0 || c >= 52) || !variants[variantName])
    throw new Error('Invalid five-card deal or variant');
  const variant = variants[variantName];
  const prize = new Map(variant.paytable.map(row => [row.key, row.units]));
  const cal = variant.calibration;
  const royalMean = Number(cal.royalLow) + Number(cal.upperNumerator) / Number(cal.upperDenominator);
  prize.set('royal', royalMean);
  const remaining = [];
  const dealt = new Set(cards);
  for (let c = 0; c < 52; c++) if (!dealt.has(c)) remaining.push(c);
  const hand = cards.slice();
  const expectedValues = [];
  for (let mask = 0; mask < 32; mask++) {
    const slots = [];
    for (let i = 0; i < 5; i++) if (!(mask & (1 << i))) slots.push(i);
    let sum = 0, count = 0;
    function enumerate(depth, start) {
      if (depth === slots.length) {
        sum += prize.get(variant.evaluate(hand)) || 0;
        count++;
        return;
      }
      const left = slots.length - depth;
      for (let j = start; j <= remaining.length - left; j++) {
        hand[slots[depth]] = remaining[j];
        enumerate(depth + 1, j + 1);
      }
    }
    enumerate(0, 0);
    expectedValues.push(sum / count);
  }
  return expectedValues;
}
self.onmessage = event => {
  const {id, cards, variant, heldMask} = event.data;
  try {
    const values = score(cards, variant);
    const best = Math.max(...values), chosen = values[heldMask];
    const tolerance = 1e-9;
    const bestMasks = values.map((v, mask) => ({mask, value:v}))
      .filter(entry => best - entry.value <= tolerance).map(entry => entry.mask);
    const alternatives = values.map((value, mask) => ({mask, value}))
      .sort((a,b) => b.value - a.value || a.mask - b.mask).slice(0, 5);
    self.postMessage({id, result:{variant, cards, heldMask, chosen, best, loss: Math.max(0,best-chosen),
      accuracy: best > 0 ? Math.min(1,chosen/best) : 1, bestMasks, alternatives}});
  } catch (error) {
    self.postMessage({id, error:String(error.message || error)});
  }
};
