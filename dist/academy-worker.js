'use strict';
importScripts('math/calibration.js', 'math/poker-math.js');
const variants = SilverSpurMath.variants;
function paytableFor(variant, custom) {
  const rows = variant.paytable;
  if (custom == null) return new Map(rows.map(r => [r.key, r.units]));
  if (!custom || typeof custom !== 'object' || Array.isArray(custom))
    throw new Error('Invalid custom paytable');
  const expectedKeys = new Set(rows.map(r=>r.key));
  if (Object.keys(custom).length !== expectedKeys.size ||
      !Object.entries(custom).every(([key,value]) => expectedKeys.has(key) &&
      Number.isSafeInteger(value) && value >= 0 && value <= 100000))
    throw new Error('Custom paytable must specify a nonnegative integer for every winning category');
  return new Map(Object.entries(custom));
}
function score(cards, variantName, custom) {
  if (!Array.isArray(cards) || cards.length !== 5 || new Set(cards).size !== 5 ||
      cards.some(c => !Number.isInteger(c) || c < 0 || c >= 52) || !variants[variantName])
    throw new Error('Invalid five-card deal or variant');
  const variant = variants[variantName];
  const prize = paytableFor(variant, custom);
  const cal = variant.calibration;
  const bonusChance = custom == null ? Number(cal.upperNumerator) / Number(cal.upperDenominator) : 0;
  const royalBase = custom == null ? Number(cal.royalLow) : custom.royal;
  prize.set('royal', royalBase + bonusChance);
  const remaining = [];
  const dealt = new Set(cards);
  for (let c = 0; c < 52; c++) if (!dealt.has(c)) remaining.push(c);
  const hand = cards.slice();
  const results = [];
  for (let mask = 0; mask < 32; mask++) {
    for (let i = 0; i < 5; i++) hand[i] = cards[i];
    const slots = [];
    for (let i = 0; i < 5; i++) if (!(mask & (1 << i))) slots.push(i);
    let sum = 0, squared = 0, count = 0, wins = 0;
    const categories = {};
    function enumerate(depth, start) {
      if (depth === slots.length) {
        const category = variant.evaluate(hand);
        const award = prize.get(category) || 0;
        sum += award;
        squared += award * award + (category === 'royal' ? bonusChance * (1 - bonusChance) : 0);
        count++;
        if (award > 0) wins++;
        categories[category] = (categories[category] || 0) + 1;
        return;
      }
      const left = slots.length - depth;
      for (let j = start; j <= remaining.length - left; j++) {
        hand[slots[depth]] = remaining[j];
        enumerate(depth + 1, j + 1);
      }
    }
    enumerate(0, 0);
    const value = sum / count;
    results.push({mask, value, variance:Math.max(0,squared/count-value*value),
      winChance:wins/count, count, categories});
  }
  return results;
}
self.onmessage = event => {
  const {id, cards, variant, heldMask, paytable} = event.data;
  try {
    if (!Number.isInteger(heldMask) || heldMask < 0 || heldMask > 31)
      throw new Error('Invalid hold mask');
    const results = score(cards, variant, paytable);
    const best = Math.max(...results.map(r=>r.value)), chosen = results[heldMask].value;
    const tolerance = 1e-9;
    const bestMasks = results.filter(r => best-r.value <= tolerance).map(r=>r.mask);
    const alternatives = results.map(({mask,value,variance,winChance}) =>
      ({mask,value,variance,winChance})).sort((a,b)=>b.value-a.value || a.mask-b.mask);
    const bestChoice = results[bestMasks[0]];
    const selected = results[heldMask];
    self.postMessage({id, result:{variant, cards, heldMask, chosen, best, loss:Math.max(0,best-chosen),
      accuracy:best>0?Math.min(1,chosen/best):1, bestMasks, alternatives,
      selected:{variance:selected.variance, winChance:selected.winChance,
        probabilities:selected.categories, outcomes:selected.count},
      optimal:{variance:bestChoice.variance, winChance:bestChoice.winChance,
        probabilities:bestChoice.categories, outcomes:bestChoice.count},
      customPaytable:paytable != null}});
  } catch (error) {
    self.postMessage({id, error:String(error.message || error)});
  }
};
