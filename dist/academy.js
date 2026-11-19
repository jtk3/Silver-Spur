'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'silver-spur-academy-v1';
  const names = {jacks:'Jacks or Better',deuces:'Deuces Wild',doubleDouble:'Double Double Bonus'};
  const format = value => Number(value).toFixed(4);
  const defaults = () => ({mode:'guided',count:0,optimalEV:0,chosenEV:0,totalLoss:0,assisted:0,byVariant:{}});
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && ['guided','practice','certification'].includes(saved.mode) &&
          Number.isFinite(saved.optimalEV) && Number.isFinite(saved.chosenEV) &&
          Number.isInteger(saved.count) && saved.count >= 0) return {...defaults(),...saved};
    } catch {}
    return defaults();
  }
  let stats = restore(), last = null, running = null, serial = 0, hinted = false;
  const save = () => { try { localStorage.setItem(storageKey,JSON.stringify(stats)); } catch {} };
  function modeChanged() {
    document.body.classList.toggle('academy-certification',stats.mode === 'certification');
    document.body.classList.toggle('academy-guided',stats.mode === 'guided');
    $('academyMode').value = stats.mode;
    if (stats.mode === 'certification') $('academyFeedback').textContent =
      'Certification mode: assistance is hidden; results remain concealed until you switch modes.';
  }
  function render() {
    if (stats.mode === 'certification') {
      $('academyAccuracy').textContent = 'Hidden';
      $('academyLoss').textContent = 'Hidden';
      $('academyCount').textContent = String(stats.count);
      return;
    }
    $('academyAccuracy').textContent = stats.optimalEV > 0
      ? (100 * stats.chosenEV / stats.optimalEV).toFixed(5) + '%' : '—';
    $('academyLoss').textContent = format(stats.totalLoss);
    $('academyCount').textContent = String(stats.count);
  }
  function cardLabel(card) {
    return ['2','3','4','5','6','7','8','9','10','J','Q','K','A'][Math.floor(card/4)] +
      ['♠','♥','♣','♦'][card%4];
  }
  function maskLabel(mask,cards) {
    const held = cards.filter((_,i) => mask & (1 << i)).map(cardLabel);
    return held.length ? held.join(' ') : 'Draw five';
  }
  function showAnalysis(result, bet, assisted) {
    const {chosen,best,loss,heldMask,cards,alternatives,bestMasks} = result;
    const details = $('academyAlternatives');
    details.replaceChildren();
    const title = document.createElement('p');
    title.textContent = 'Recommended holds (expected credits per wagered credit):';
    details.append(title);
    const list = document.createElement('ol');
    for (const choice of alternatives) {
      const line = document.createElement('li');
      line.textContent = maskLabel(choice.mask,cards) + ' — ' + format(choice.value);
      if (choice.mask === heldMask) line.textContent += ' (your selection)';
      list.append(line);
    }
    details.append(list);
    const note = document.createElement('p');
    note.textContent = 'Expected values include the fractional royal bonus. Multiple holds can tie for optimal value.';
    details.append(note);
    const perfect = loss < 1e-9;
    const verb = assisted ? 'Assisted' : perfect ? 'Optimal' : 'Below optimal';
    $('academyFeedback').textContent = verb + ' decision · Your hold: ' +
      format(chosen*bet) + ' expected credits · Best: ' + format(best*bet) +
      ' · Expected loss: ' + format(loss*bet) + ' credits.' +
      (bestMasks.length > 1 ? ' Multiple optimal holds.' : '');
    details.hidden = true;
  }
  $('academyMode').addEventListener('change', e => {
    stats.mode = e.target.value;
    save(); modeChanged(); render();
    if (stats.mode !== 'certification' && last) showAnalysis(last.result,last.bet,last.assisted);
    else if (stats.mode === 'certification') $('academyAlternatives').hidden = true;
  });
  $('academyDetails').addEventListener('click', () => {
    if (stats.mode === 'certification') {
      $('academyFeedback').textContent = 'Switch out of certification mode to review previous decisions.';
      return;
    }
    if (last) {
      showAnalysis(last.result,last.bet,last.assisted);
      $('academyAlternatives').hidden = !$('academyAlternatives').hidden;
    }
  });
  $('academyReset').addEventListener('click', () => {
    if (!confirm('Reset Academy grading statistics in this browser? Your Silver Spur game credits are unaffected.')) return;
    const mode = stats.mode;
    stats = defaults(); stats.mode = mode; save(); render();
    $('academyFeedback').textContent = 'Training statistics cleared.';
    $('academyAlternatives').hidden = true;
  });
  window.addEventListener('silver-spur:deal', () => {
    hinted = false;
    if (stats.mode !== 'certification') $('academyFeedback').textContent = 'Choose your hold, then draw. Economic grading follows.';
    $('academyAlternatives').hidden = true;
  });
  window.addEventListener('silver-spur:hint', () => { hinted = true; });
  window.addEventListener('silver-spur:decision', e => {
    const decision = {...e.detail, assisted:hinted};
    hinted = false;
    if (running) running.terminate();
    const current = ++serial;
    const worker = new Worker('academy-worker.js');
    running = worker;
    if (stats.mode !== 'certification') $('academyFeedback').textContent = 'Calculating exact expected values for all 32 holds…';
    worker.onmessage = msg => {
      if (current !== serial) return;
      worker.terminate(); running = null;
      if (msg.data.error) {
        $('academyFeedback').textContent = 'Analysis unavailable: ' + msg.data.error;
        return;
      }
      const result = msg.data.result, bet = decision.bet;
      const optimalEV = result.best * bet, chosenEV = result.chosen * bet;
      const v = stats.byVariant[decision.variant] || {count:0,optimalEV:0,chosenEV:0,loss:0};
      v.count++; v.optimalEV += optimalEV; v.chosenEV += chosenEV; v.loss += result.loss*bet;
      stats.byVariant[decision.variant] = v;
      stats.count++; stats.optimalEV += optimalEV; stats.chosenEV += chosenEV;
      stats.totalLoss += result.loss * bet;
      if (decision.assisted) stats.assisted++;
      last = {result,bet,assisted:decision.assisted};
      save(); render();
      if (stats.mode === 'certification') $('academyFeedback').textContent =
        'Decision '+stats.count+' recorded. Results are concealed during certification.';
      else showAnalysis(result,bet,decision.assisted);
    };
    worker.onerror = () => {
      if (current !== serial) return;
      worker.terminate(); running = null;
      $('academyFeedback').textContent = 'Analysis worker failed. Check the browser console.';
    };
    worker.postMessage({id:current,variant:decision.variant,cards:decision.cards,heldMask:decision.heldMask});
  });
  modeChanged(); render();
})();
