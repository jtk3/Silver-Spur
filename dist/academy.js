'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'silver-spur-academy-v1';
  const customKey = 'silver-spur-academy-custom-paytables-v1';
  const names = {jacks:'Jacks or Better',deuces:'Deuces Wild',doubleDouble:'Double Double Bonus'};
  const format = value => Number(value).toFixed(4);
  const defaults = () => ({mode:'guided',count:0,optimalEV:0,chosenEV:0,totalLoss:0,assisted:0,byVariant:{},mistakes:[],assessments:[]});
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && ['guided','practice','certification'].includes(saved.mode) &&
          Number.isFinite(saved.optimalEV) && Number.isFinite(saved.chosenEV) &&
          Number.isInteger(saved.count) && saved.count >= 0) return {...defaults(),...saved};
    } catch {}
    return defaults();
  }
  let stats = restore(), last = null, running = null, hinted = false;
  let paytables = readPaytables();
  let editVariant = null;
  let assessment = stats.activeAssessment && stats.activeAssessment.count >= 0 &&
    stats.activeAssessment.count < 100 ? stats.activeAssessment : null;
  const pending = [];
  const save = () => { try { localStorage.setItem(storageKey,JSON.stringify(stats)); } catch {} };
  function readPaytables() {
    try {
      const tables = JSON.parse(localStorage.getItem(customKey));
      return tables && typeof tables === 'object' && !Array.isArray(tables) ? tables : {};
    } catch { return {}; }
  }
  function paytableFor(variant) {
    const custom = paytables[variant], rows = SilverSpurMath.variants[variant].paytable;
    return custom && Object.keys(custom).length === rows.length &&
      rows.every(r => Number.isSafeInteger(custom[r.key]) &&
        custom[r.key] >= 0 && custom[r.key] <= 100000) ? {...custom} : null;
  }
  const activeVariant = () => document.querySelector('#gamePicker button[aria-pressed="true"]')?.dataset.variant;
  function savePaytables() {
    localStorage.setItem(customKey, JSON.stringify(paytables));
    window.dispatchEvent(new Event('silver-spur:paytables'));
  }
  function openPaytable() {
    if (stats.mode === 'certification' || $('cards').classList.contains('can-hold')) {
      $('academyFeedback').textContent =
        'Finish the current hand and leave certification mode before editing the paytable.';
      return;
    }
    editVariant = activeVariant();
    const rows = SilverSpurMath.variants[editVariant].paytable;
    const current = paytableFor(editVariant);
    const host = $('academyPaytableRows');
    host.replaceChildren();
    for (const row of rows) {
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = row.name;
      const field = document.createElement('input');
      field.type = 'number'; field.min = '0'; field.max = '100000';field.step = '1';
      field.value = String(current ? current[row.key] : row.units);
      field.dataset.key = row.key;
      label.append(name,field);host.append(label);
    }
    $('academyPaytableMessage').textContent = current ?
      'Custom paytable active for '+names[editVariant]+'.' :
      'Original calibrated Silver Spur paytable active.';
    $('academySettings').showModal();
  }
  $('academyPaytable').addEventListener('click',openPaytable);
  $('academySettingsClose').addEventListener('click',()=>$('academySettings').close());
  $('academyPaytableSave').addEventListener('click',() => {
    if ($('cards').classList.contains('can-hold')) {
      $('academyPaytableMessage').textContent = 'Finish the current hand before changing payouts.';
      return;
    }
    const custom = {};
    for (const input of $('academyPaytableRows').querySelectorAll('input')) {
      const raw = input.value.trim();
      const value = Number(raw);
      if (!/^\\d+$/.test(raw) || !Number.isSafeInteger(value) || value > 100000) {
        $('academyPaytableMessage').textContent = 'Every payout must be a whole number from 0 through 100,000.';
        input.focus(); return;
      }
      custom[input.dataset.key] = value;
    }
    paytables[editVariant] = custom;
    try {savePaytables();} catch { $('academyPaytableMessage').textContent = 'Unable to save paytable in this browser.'; return; }
    $('academySettings').close();
    $('academyFeedback').textContent = 'Custom payout schedule saved for '+names[editVariant]+
      '. Hold advice and grade calculations now use this paytable.';
  });
  $('academyPaytableRestore').addEventListener('click',() => {
    if ($('cards').classList.contains('can-hold')) {
      $('academyPaytableMessage').textContent = 'Finish the current hand before changing payouts.';
      return;
    }
    delete paytables[editVariant];
    try {savePaytables();} catch { $('academyPaytableMessage').textContent = 'Unable to save paytable in this browser.'; return; }
    $('academySettings').close();
    $('academyFeedback').textContent = 'Original 101% calibrated paytable restored for '+names[editVariant]+'.';
  });

  function modeChanged() {
    document.body.classList.toggle('academy-certification',stats.mode === 'certification');
    document.body.classList.toggle('academy-guided',stats.mode === 'guided');
    document.body.classList.toggle('academy-practice',stats.mode === 'practice');
    window.SilverSpurAcademyCertification = Boolean(assessment);
    $('academyAssessment').textContent = assessment ? 'End assessment early' : 'Start 100-hand assessment';
    $('academyMode').value = stats.mode;
    if (stats.mode === 'certification') $('academyFeedback').textContent =
      'Certification mode: assistance is hidden. Start a 100-hand assessment to earn a recorded result.';
  }
  function render() {
    if (stats.mode === 'certification') {
      $('academyAccuracy').textContent = 'Hidden';
      $('academyLoss').textContent = 'Hidden';
      $('academyCount').textContent = String(assessment ? assessment.count : stats.count);
      $('academyByGame').replaceChildren();
      renderAssessments();
      return;
    }
    $('academyAccuracy').textContent = stats.optimalEV > 0
      ? (100 * stats.chosenEV / stats.optimalEV).toFixed(5) + '%' : '—';
    $('academyLoss').textContent = format(stats.totalLoss);
    $('academyCount').textContent = String(stats.count);
    const host = $('academyByGame');
    host.replaceChildren();
    for (const [key, v] of Object.entries(stats.byVariant)) {
      const row = document.createElement('p');
      const ratio = v.optimalEV ? 100*v.chosenEV/v.optimalEV : 100;
      row.textContent = names[key] + ': ' + v.count + ' hands · ' + ratio.toFixed(5) + '% economic accuracy · ' + format(v.loss) + ' expected credits lost';
      host.append(row);
    }
    renderAssessments();
  }
  function renderAssessments() {
    const host = $('academyAssessmentReport');
    host.replaceChildren();
    if (assessment) {
      const p = document.createElement('p');
      p.textContent = 'Assessment in progress: ' + assessment.count +
        '/100 graded hands of ' + names[assessment.variant] + '.';
      host.append(p);
    }
    if (stats.mode === 'certification') return;
    const recent = (stats.assessments || []).slice(-5).reverse();
    if (recent.length) {
      const title = document.createElement('strong');
      title.textContent = 'Recent assessments';
      host.append(title);
      for (const session of recent) {
        const line = document.createElement('p');
        const pct = session.optimalEV > 0 ? (100*session.chosenEV/session.optimalEV).toFixed(5) : '—';
        line.textContent = names[session.variant]+' · '+session.count+' decisions · '+pct+
          '% economic accuracy · '+(session.completed ? session.passed ? 'Passed' : 'Not passed' : 'Incomplete');
        host.append(line);
      }
    }
  }
  function finishAssessment() {
    if (!assessment) return;
    assessment.completed = assessment.count === 100;
    assessment.passed = assessment.completed && assessment.optimalEV > 0 &&
      assessment.chosenEV/assessment.optimalEV >= 0.999 && assessment.assisted === 0;
    stats.assessments ||= [];
    stats.assessments.push(assessment);
    if (stats.assessments.length > 30) stats.assessments.shift();
    assessment = null;
    delete stats.activeAssessment;
    stats.mode = 'practice';
    save(); modeChanged(); render();
    $('academyFeedback').textContent =
      'Assessment finished. Economic accuracy and result are shown below.';
  }
  $('academyAssessment').addEventListener('click', () => {
    if (assessment) {
      if (!confirm('End the current assessment early? It will be recorded as incomplete.')) return;
      finishAssessment();return;
    }
    if ($('cards').classList.contains('can-hold') || pending.length || running) {
      $('academyFeedback').textContent = 'Finish the current hand and outstanding analysis before starting an assessment.';
      return;
    }
    const variant = activeVariant();
    assessment = {variant,count:0,optimalEV:0,chosenEV:0,loss:0,assisted:0,
      completed:false,passed:false,started:new Date().toISOString()};
    stats.mode = 'certification';
    stats.activeAssessment = assessment;
    delete window.SilverSpurAcademyNextDeal;
    save();modeChanged();render();
    $('academyFeedback').textContent = '100-hand assessment started for '+names[variant]+'. Target: 99.9% economic accuracy.';
  });

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
    if (assessment && e.target.value !== 'certification') {
      if (!confirm('Leaving certification ends your current assessment as incomplete.')) {
        e.target.value = 'certification';return;
      }
      finishAssessment();return;
    }
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
  $('academyExport').addEventListener('click', () => {
    if (stats.mode === 'certification') {
      $('academyFeedback').textContent = 'Finish certification by switching modes before exporting results.';
      return;
    }
    const q = v => '"' + String(v).replaceAll('"','""') + '"';
    const rows = [['Variant','Decisions','Optimal EV credits','Chosen EV credits','EV loss credits','Economic accuracy percent']];
    for (const [key, v] of Object.entries(stats.byVariant))
      rows.push([names[key],v.count,v.optimalEV,v.chosenEV,v.loss,v.optimalEV?100*v.chosenEV/v.optimalEV:100]);
    rows.push(['TOTAL',stats.count,stats.optimalEV,stats.chosenEV,stats.totalLoss,
      stats.optimalEV?100*stats.chosenEV/stats.optimalEV:100]);
    const csv = rows.map(row => row.map(q).join(',')).join('\\r\\n') + '\\r\\n';
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href=url; link.download='silver-spur-academy-results.csv'; document.body.append(link);
    link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  $('academyDrill').addEventListener('click', () => {
    const active = document.querySelector('#gamePicker button[aria-pressed="true"]')?.dataset.variant;
    if (assessment) { $('academyFeedback').textContent = 'Mistake drills are unavailable during assessment.';return; }
    const matches = (stats.mistakes || []).filter(item => item.variant === active && item.loss > 1e-8);
    if (!matches.length) {
      $('academyFeedback').textContent = 'No economically costly mistakes recorded for this game yet.';
      return;
    }
    matches.sort((a,b) => b.loss - a.loss);
    const pool = matches.slice(0,Math.min(10,matches.length));
    const pick = pool[Math.floor(Math.random()*pool.length)];
    window.SilverSpurAcademyNextDeal = {variant:active,cards:pick.cards.slice()};
    $('academyFeedback').textContent =
      'Mistake drill queued for ' + names[active] + '. Finish any current hand, then press Deal to replay the five-card situation with a freshly randomized draw.';
  });
  $('academyReset').addEventListener('click', () => {
    if (!confirm('Reset Academy grading statistics in this browser? Your Silver Spur game credits are unaffected.')) return;
    const mode = stats.mode;
    assessment = null;
    if (running) { running.terminate(); running = null; }
    pending.length = 0;
    delete window.SilverSpurAcademyNextDeal;
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
  function processQueue() {
    if (running || !pending.length) return;
    const decision = pending.shift();
    const worker = new Worker('academy-worker.js');
    running = worker;
    if (stats.mode !== 'certification') $('academyFeedback').textContent =
      'Calculating exact expected values for all 32 holds…';
    function finish(error, result) {
      worker.terminate();
      if (running === worker) running = null;
      if (error) {
        $('academyFeedback').textContent = 'Analysis unavailable: ' + error;
      } else {
        const bet = decision.bet, optimalEV = result.best * bet, chosenEV = result.chosen * bet;
        const v = stats.byVariant[decision.variant] || {count:0,optimalEV:0,chosenEV:0,loss:0};
        v.count++; v.optimalEV += optimalEV; v.chosenEV += chosenEV; v.loss += result.loss*bet;
        stats.byVariant[decision.variant] = v;
        stats.count++; stats.optimalEV += optimalEV; stats.chosenEV += chosenEV;
        stats.totalLoss += result.loss * bet;
        if (decision.assisted) stats.assisted++;
        if (assessment && decision.assessment === assessment) {
          assessment.count++;assessment.optimalEV += optimalEV;assessment.chosenEV += chosenEV;
          assessment.loss += result.loss*bet;
          if (decision.assisted) assessment.assisted++;
        }
        if (result.loss > 1e-8) {
          stats.mistakes ||= [];
          stats.mistakes.push({variant:decision.variant,cards:decision.cards.slice(),
            loss:result.loss*bet,heldMask:decision.heldMask,bestMask:result.bestMasks[0]});
          if (stats.mistakes.length > 100) stats.mistakes.shift();
        }
        last = {result,bet,assisted:decision.assisted};
        save(); render();
        if (assessment && assessment.count === 100) { finishAssessment(); }
        else if (stats.mode === 'certification') $('academyFeedback').textContent =
          'Assessment decision '+(assessment ? assessment.count : stats.count)+' recorded. Results remain concealed.';
        else showAnalysis(result,bet,decision.assisted);
      }
      processQueue();
    }
    worker.onmessage = msg => finish(msg.data.error, msg.data.result);
    worker.onerror = () => finish('The analysis worker failed. Check the browser console.');
    worker.postMessage({variant:decision.variant,cards:decision.cards,heldMask:decision.heldMask,paytable:decision.paytable});
  }
  window.addEventListener('silver-spur:decision', e => {
    pending.push({...e.detail, assisted:hinted, paytable:paytableFor(e.detail.variant),assessment});
    hinted = false;
    processQueue();
  });
  modeChanged(); render();
})();
