'use strict';
(() => {
  const poker = SilverSpurMath, $ = id => document.getElementById(id);
  const legacyStoreKey = 'silver-spur-academy-game-lock';
  const previousStoreKey = 'silver-spur-academy-game-v0';
  const storeKey = 'silver-spur-academy-game-v1';
  const initialCredits = 1000;
  const gameInfo = {
    jacks: {
      name: 'Jacks or Better',
      rules: 'A pair of jacks, queens, kings or aces pays back your wager. Two pair and stronger hands pay more.'
    },
    deuces: {
      name: 'Deuces Wild',
      rules: 'All four twos are wild. Three of a kind is the minimum paying hand. Four deuces, five of a kind, and natural and wild royal flushes each have their own payout.'
    },
    doubleDouble: {
      name: 'Double Double Bonus',
      rules: 'Two pair pays back your wager. The fifth card, called the kicker, can boost certain four-of-a-kind wins. A 2, 3, or 4 boosts four aces. An ace, 2, 3, or 4 boosts four twos, threes, or fours.'
    }
  };
  const suits = ['♠', '♥', '♣', '♦'], suitNames = ['spades','hearts','clubs','diamonds'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const spoken = ['Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Jack','Queen','King','Ace'];
  const demo = [48,45,42,39,32];
  const deucesDemo = [48,45,0,39,32];
  const fmt = number => number.toLocaleString('en-US');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const symbols = name => '<svg class="ic" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const blanks = () => ({ version:3, variant:'jacks', credits:initialCredits, bet:5, phase:'idle', holds:0, seq:0, cards:[], stock:[], pausedHands:{}, win:0, result:'nothing', paidBet:0, hands:0, wagered:0, returned:0, peak:0 });
  const validBet = bet => Number.isInteger(bet) && bet >= 1 && bet <= 5;
  const validHoldMask = mask => Number.isInteger(mask) && mask >= 0 && mask <= 31;
  function validCards(cards, stock) {
    if (!Array.isArray(cards) || !Array.isArray(stock)) return false;
    const ids = cards.concat(stock);
    return ids.every(id => Number.isInteger(id) && id >= 0 && id < 52) &&
      new Set(ids).size === ids.length;
  }
  function validPausedHand(hand) {
    return hand && validBet(hand.paidBet) && validHoldMask(hand.holds) &&
      validCards(hand.cards, hand.stock) && hand.cards.length === 5 && hand.stock.length === 5;
  }
  function readSaved() {
    try {
      const current = localStorage.getItem(storeKey), previous = current === null ? localStorage.getItem(previousStoreKey) : null;
      const s = JSON.parse(current ?? previous ?? localStorage.getItem(legacyStoreKey));
      const expectedVersion = current !== null ? 3 : previous !== null ? 2 : 1;
      if (!s || s.version !== expectedVersion || !['idle','hold','complete'].includes(s.phase)) return null;
      if (s.version === 1) s.variant = 'jacks';
      if (s.version < 3) { s.version = 3; s.pausedHands = {}; }
      if (!Object.hasOwn(gameInfo, s.variant)) return null;
      if (!['credits','win','seq','hands','wagered','returned','peak'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0) ||
          !validBet(s.bet) || !validHoldMask(s.holds) || !validCards(s.cards, s.stock)) return null;
      if (s.phase !== 'idle' && (s.cards.length !== 5 || !validBet(s.paidBet))) return null;
      if (s.phase === 'hold' && (s.stock.length !== 5 || s.bet !== s.paidBet)) return null;
      const paused = s.pausedHands;
      if (!paused || typeof paused !== 'object' || Array.isArray(paused) ||
          !Object.entries(paused).every(([variant, hand]) =>
            variant !== s.variant && Object.hasOwn(gameInfo, variant) && validPausedHand(hand))) return null;
      return s;
    } catch { return null; }
  }
  let state = readSaved() || blanks();
  const activePoker = () => poker.variants[state.variant];
  let tallyFrame = 0;
  let busy = false, writing = false, hintRequest = 0, hintSerial = 0, message = '', activeDialog = '';
  function clearHint() {
    hintSerial++;
    hintRequest = 0;
  }
  function save() { try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch {} }
  async function change(apply) {
    if (writing) return false;
    writing = true;
    const seq = state.seq, phase = state.phase;
    function commit() {
      state = readSaved() || state;
      if (state.seq !== seq || state.phase !== phase) { render(); return false; }
      const changed = apply(); if (changed !== false) save(); return changed !== false;
    }
    try {
      if (navigator.locks) return await navigator.locks.request(legacyStoreKey, commit);
      return commit();
    } finally { writing = false; }
  }
  function deck() {
    const cards = Array.from({length:52}, (_, i) => i);
    for (let i=0; i<10; i++) {
      const j = i + poker.randomBelow(52-i);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards.slice(0,10);
  }
  const pips = {
    2:[[50,12],[50,88]],3:[[50,10],[50,50],[50,90]],4:[[14,12],[86,12],[14,88],[86,88]],
    5:[[14,12],[86,12],[50,50],[14,88],[86,88]],
    6:[[14,12],[86,12],[14,50],[86,50],[14,88],[86,88]],
    7:[[14,12],[86,12],[50,31],[14,50],[86,50],[14,88],[86,88]],
    8:[[14,12],[86,12],[50,31],[14,50],[86,50],[50,69],[14,88],[86,88]],
    9:[[14,8],[86,8],[14,36],[86,36],[50,50],[14,64],[86,64],[14,92],[86,92]],
    10:[[14,8],[86,8],[50,20],[14,36],[86,36],[14,64],[86,64],[50,80],[14,92],[86,92]]
  };
  function face(id, wild) {
    const rank = ranks[Math.floor(id/4)], suit = suits[id%4];
    const corner = '<b>'+rank+'</b><i>'+suit+'</i>';
    let center;
    if ('JQK'.includes(rank)) {
      const art = {J:'jack',Q:'queen',K:'king'}[rank];
      center = '<span class="court-frame"></span><img draggable="false" class="portrait" src="art/'+art+'.webp" alt="">';
    } else if (rank === 'A') {
      center = '<span class="pip-field">'+suit+'</span><svg class="ace-star" viewBox="0 0 40 40"><use href="#i-star"/></svg><span class="ace-mark">Silver Spur</span>';
    } else {
      center = '<span class="pip-field">'+pips[rank].map(([x,y])=>'<i class="pip'+(y>50?' inverted':'')+'" style="left:'+x+'%;top:'+y+'%;font-style:normal">'+suit+'</i>').join('')+'</span>';
    }
    if (wild) center += '<span class="wild-mark">WILD</span>';
    return '<span class="card'+(rank === 'A'?' ace':rank === '10'?' ten':'')+'" aria-hidden="true"><span class="corner">'+corner+'</span>'+center+'<span class="corner last">'+corner+'</span></span>';
  }
  const cardButtons = Array.from({length:5}, (_, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'cardbutton'; button.addEventListener('click', () => toggleCard(i));
    $('cards').append(button); return button;
  });
  const variantButtons = [...$('gamePicker').querySelectorAll('button')];
  const payRows = new Map();
  let shownVariant;
  function renderGameSelection() {
    for (const button of variantButtons) {
      const variant = button.dataset.variant;
      const selected = variant === state.variant;
      const paused = Object.hasOwn(state.pausedHands, variant);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-disabled', String(busy && !selected));
      button.classList.toggle('has-paused-hand', paused);
      button.title = paused ? 'Resume your saved hand' : '';
      if (paused) button.setAttribute('aria-description', 'Saved hand ready to draw');
      else button.removeAttribute('aria-description');
    }
    if (shownVariant === state.variant) return;
    shownVariant = state.variant;
    $('gameTitle').textContent = gameInfo[state.variant].name;
    $('gameTitle').classList.toggle('long-title', state.variant === 'doubleDouble');
    document.querySelector('.paytable').dataset.variant = state.variant;
    $('royalInfoLabel').textContent = state.variant === 'deuces' ? 'Natural royal flush bonus' : 'Royal flush bonus';
    $('pays').replaceChildren();
    payRows.clear();
    for (const row of activePoker().paytable) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pay-row';
      const label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = row.name;
      wrapper.append(label, value);
      $('pays').append(wrapper);
      payRows.set(row.key, {element:wrapper, value});
    }
  }
  function canDraw() { return state.phase === 'hold'; }
  function drawMessage() {
    if (busy) return canDraw() ? 'Dealing five cards…' : 'Drawing replacement cards…';
    if (message) return message;
    if (canDraw()) return 'Choose cards to hold, then draw.';
    if (state.credits === 0) return 'Add free credits to play again.';
    if (state.credits < state.bet) return 'Lower your bet to deal again.';
    if (state.phase === 'complete') {
      if (state.win) {
        const winningRow = activePoker().paytable.find(entry => entry.key === state.result);
        return winningRow.name + ' · ' + fmt(state.win) + (state.win === 1 ? ' credit' : ' credits') + ' won';
      }
      return 'No winning hand. Deal again.';
    }
    return 'Place your bet, then deal.';
  }
  function render() {
    renderGameSelection();
    const deuces = state.variant === 'deuces';
    const display = state.phase === 'idle' ? (deuces ? deucesDemo : demo) : state.cards;
    const playable = canDraw() && !busy;
    $('cards').classList.toggle('attract',state.phase === 'idle');
    $('cards').classList.toggle('can-hold',canDraw());
    cardButtons.forEach((button,i) => {
      const id = display[i], held = Boolean(state.holds & (1<<i));
      const wild = deuces && id < 4;
      const cardKey = id + (wild ? '-wild' : '');
      if (button.dataset.cardKey !== cardKey) {
        button.innerHTML = face(id, wild) + '<span class="hold-label" aria-hidden="true"></span>';
        button.dataset.cardKey = cardKey;
      }
      button.classList.toggle('held',held);
      button.classList.toggle('red',id%4 === 1 || id%4 === 3);
      button.disabled = !playable;
      button.setAttribute('aria-pressed',String(held));
      button.setAttribute('aria-label',spoken[Math.floor(id/4)]+' of '+suitNames[id%4]+(wild?', wild':'')+(canDraw()?(held?', held':', tap to hold'):''));
      button.lastElementChild.textContent = held ? 'HELD' : 'HOLD';
    });
    const showingDraw = busy && state.phase === 'complete';
    $('credits').textContent = fmt(state.credits - (showingDraw ? state.win : 0));
    $('win').textContent = fmt(showingDraw ? 0 : state.win);
    document.querySelector('.deck-controls').classList.toggle('long-meters',fmt(state.credits).length + fmt(state.win).length > 8);
    $('bet').textContent = state.bet;
    $('betDown').disabled = canDraw() || busy || state.bet === 1;
    $('betUp').disabled = canDraw() || busy || state.bet >= Math.min(state.credits,5);
    const empty = !canDraw() && state.credits === 0;
    $('play').querySelector('span').textContent = empty ? 'Refill' : canDraw() ? 'Draw' : 'Deal';
    $('play').disabled = busy || (!canDraw() && !empty && state.bet > state.credits);
    $('hint').hidden = !canDraw() || busy;
    $('hint').disabled = Boolean(hintRequest);
    $('hint').querySelector('span').textContent = hintRequest ? 'Checking…' : 'Best hold';
    $('statusText').textContent = drawMessage();
    $('status').classList.toggle('paid',!busy && state.phase==='complete' && state.win > 0);
    $('payBet').textContent = state.bet+'-credit bet';
    for (const row of activePoker().paytable) {
      const ref = payRows.get(row.key);
      ref.value.textContent = fmt(row.units*state.bet)+(row.units !== row.maxUnits ? ' / '+fmt(row.maxUnits*state.bet) : '');
      ref.element.classList.toggle('is-win',!busy && state.phase==='complete' && state.result===row.key && state.bet===state.paidBet);
    }
  }
  async function selectGame(variant) {
    if (variant === state.variant || busy) return;
    if (await change(() => {
      if (variant === state.variant) return false;
      if (canDraw()) {
        const {cards, stock, holds, paidBet} = state;
        state.pausedHands[state.variant] = {cards, stock, holds, paidBet};
      }
      const hand = state.pausedHands[variant];
      delete state.pausedHands[variant];
      state.variant = variant;
      state.seq++;
      state.phase = hand ? 'hold' : 'idle';
      state.holds = hand?.holds ?? 0;
      state.cards = hand?.cards ?? [];
      state.stock = hand?.stock ?? [];
      state.win = 0;
      state.result = 'nothing';
      state.paidBet = hand?.paidBet ?? 0;
      if (hand) state.bet = hand.paidBet;
    })) {
      cancelAnimationFrame(tallyFrame);
      clearHint();
      message = canDraw() ? 'Hand resumed. Choose your holds, then draw.' : '';
    }
    render();
  }
  function setSoundLabel() {
    const enabled = SpurSound.enabled;
    $('sound').innerHTML = symbols(enabled?'speaker':'mute')+'<span>Sound '+(enabled?'on':'off')+'</span>';
    $('sound').setAttribute('aria-pressed',String(enabled));
  }
  async function step(delta) {
    if (canDraw() || busy) return;
    await change(() => {
      const bet = state.bet + delta;
      if (bet < 1 || bet > 5 || (delta>0 && bet > state.credits)) return false;
      state.bet = bet; message = ''; return true;
    });
    render();
  }
  async function toggleCard(i) {
    if (!canDraw() || busy) return;
    SpurSound.wake();
    if (await change(() => { state.holds ^= 1<<i; message=''; clearHint(); })) {
      SpurSound.hold(Boolean(state.holds & (1<<i)));
    }
    render();
  }
  async function bestHold() {
    if (!canDraw() || busy || hintRequest) return;
    SpurSound.wake(); const seq = state.seq, token = ++hintSerial;
    hintRequest = token; render();
    try {
      const mask = await activePoker().bestHold(state.cards);
      if (!canDraw() || state.seq !== seq || token !== hintSerial) return;
      if (await change(() => { state.holds=mask; })) {
        window.dispatchEvent(new CustomEvent('silver-spur:hint', {detail:{variant:state.variant, cards:state.cards.slice()}}));
        message = mask === 0 ? 'Best play is to draw five new cards.' : 'Optimal hold set. Ready to draw.';
        SpurSound.hold(true);
      }
    } catch { if(canDraw() && state.seq === seq && token === hintSerial) message='Hold guide unavailable. Tap to retry.'; }
    finally {
      if (hintRequest === token) { hintRequest = 0; render(); }
    }
  }
  function countWin(seq) {
    if (reduceMotion.matches) return;
    const win = state.win, base = state.credits - win;
    const start = performance.now(), duration = Math.min(950, 180 + Math.log2(win + 1) * 66);
    function frame(now) {
      if (state.seq !== seq || busy || state.phase !== 'complete') return;
      const part = Math.min(1, (now - start) / duration);
      const shown = Math.floor(win * (1 - (1 - part) ** 2));
      $('credits').textContent = fmt(base + shown);
      $('win').textContent = fmt(shown);
      if (part < 1) tallyFrame = requestAnimationFrame(frame);
    }
    tallyFrame = requestAnimationFrame(frame);
  }
  function reveal(slots, result, seq) {
    const stepMs = reduceMotion.matches ? 0 : 68;
    slots.forEach((slot,i) => {
      const button = cardButtons[slot]; button.style.setProperty('--lag',i*stepMs+'ms');
      button.classList.remove('arrive'); void button.offsetWidth; button.classList.add('arrive');
      SpurSound.card(i);
    });
    const duration = reduceMotion.matches ? 30 : slots.length ? 315 + (slots.length-1)*stepMs : 100;
    window.setTimeout(() => {
      cardButtons.forEach(b => b.classList.remove('arrive'));
      busy=false; render();
      if (state.seq === seq && result) {
        countWin(seq);
        const bigWin = state.result === 'straightFlush' || state.win >= state.paidBet * 50;
        SpurSound.win(bigWin ? 3 : state.win >= state.paidBet*3 ? 2 : 1);
        const meter = $('win').parentElement; meter.classList.remove('flash'); void meter.offsetWidth; meter.classList.add('flash');
        if (bigWin) { const felt = document.querySelector('.felt'); felt.classList.remove('jackpot'); void felt.offsetWidth; felt.classList.add('jackpot'); }
      }
    },duration);
  }
  async function play() {
    if (busy || writing || $('dialog').open) return;
    SpurSound.wake();
    if (!canDraw() && state.credits===0) { showDialog('refill'); return; }
    let slots = [], paid = false;
    const academyDecision = canDraw() ? {variant:state.variant,cards:state.cards.slice(),heldMask:state.holds,bet:state.paidBet} : null;
    cancelAnimationFrame(tallyFrame); busy=true; clearHint(); message='';
    try {
      const changed = await change(() => {
        if (canDraw()) {
          let next = 0;
          state.cards = state.cards.map((id,i) => {
            if (state.holds & (1<<i)) return id;
            slots.push(i); return state.stock[next++];
          });
          state.stock=[];
          const rules = activePoker();
          state.result=rules.evaluate(state.cards); state.win=rules.payout(state.result,state.paidBet);
          state.credits+=state.win; state.returned+=state.win; state.peak=Math.max(state.peak,state.win);
          state.hands++; state.phase='complete'; paid=state.win>0;
        } else {
          if (state.credits < state.bet) return false;
          const shuffled=deck();
          state.cards=shuffled.slice(0,5); state.stock=shuffled.slice(5);
          state.seq++; state.paidBet=state.bet; state.credits-=state.bet; state.wagered+=state.bet;
          state.phase='hold'; state.holds=0; state.win=0; state.result='nothing'; slots=[0,1,2,3,4];
        }
      });
      if (!changed) { busy=false; render(); return; }
      if (academyDecision) window.dispatchEvent(new CustomEvent('silver-spur:decision',{detail:academyDecision}));
      else window.dispatchEvent(new CustomEvent('silver-spur:deal',{detail:{variant:state.variant,cards:state.cards.slice(),bet:state.paidBet}}));
      render(); reveal(slots,paid,state.seq);
    } catch { busy=false; message='Unable to deal. Please try again.'; render(); }
  }
  const statsRow = (label,value) => '<div><dt>'+label+'</dt><dd>'+value+'</dd></div>';
  const returnsText = '<p>In each Silver Spur game, every credit wagered returns <strong>1.01 credits on average</strong> when you choose the best hold on every deal. The calculation covers all 2,598,960 starting hands and all 32 hold choices for each game. Individual sessions can finish ahead or behind.</p>';
  function royalDetails() {
    const {royalLow, upperNumerator, upperDenominator} = activePoker().calibration;
    const royal = state.variant === 'deuces' ? 'natural royal flush' : 'royal flush';
    const percentage = (100 * Number(upperNumerator) / Number(upperDenominator)).toFixed(3);
    return '<p>A ' + royal + ' in <b>' + gameInfo[state.variant].name + '</b> pays <strong>' +
      fmt(royalLow) + '× or ' + fmt(royalLow + 1) + '× your bet</strong>. An independent draw awards the higher prize with probability ' +
      fmt(BigInt(upperNumerator)) + ' in ' + fmt(BigInt(upperDenominator)) + ' (about ' + percentage + '%).</p>';
  }
  function showDialog(which) {
    const d=$('dialog'), body=$('dialogBody'); activeDialog=which;
    if (which === 'guide') {
      $('dialogTitle').textContent='Game guide';
      body.innerHTML = '<ol><li>Choose a game and bet <b>1 to 5 credits</b>. Press <b>Deal</b> to receive five cards from a shuffled 52-card deck.</li>' +
        '<li>Tap cards to <b>hold</b> or release them. <b>Best hold</b> selects the optimal play for your hand and game.</li>' +
        '<li>Press <b>Draw</b> to replace every unheld card from the remaining deck. Your highest paying hand wins. If you switch games before drawing, your hand and wager are saved for when you return.</li></ol>' +
        '<div class="variant-rules"><h3>' + gameInfo[state.variant].name + '</h3><p>' + gameInfo[state.variant].rules + '</p></div>' +
        '<details><summary>Keyboard controls</summary><p>Keys 1 through 5 toggle the cards from left to right. Space deals or draws. Tab and Enter operate individual controls.</p></details>' +
        '<details><summary>Perfect play and the royal bonus</summary>' + returnsText + royalDetails() + '</details>';
    } else if (which === 'session') {
      $('dialogTitle').textContent='Session stats';
      const inPlay = Object.values(state.pausedHands)
        .reduce((total, hand) => total + hand.paidBet, canDraw() ? state.paidBet : 0);
      const net = state.returned - (state.wagered - inPlay);
      body.innerHTML='<dl class="stats">'+statsRow('Hands completed',fmt(state.hands))+statsRow('Credits wagered',fmt(state.wagered))+statsRow('Credits returned',fmt(state.returned))+statsRow('Largest payout',fmt(state.peak))+statsRow('Net on completed hands',(net>0?'+':'')+fmt(net))+'</dl><p class="fine" style="margin-top:14px">Your credits and stats carry across all three games. Unfinished hands are saved in this browser.</p>';
    } else if (which === 'refill') {
      $('dialogTitle').textContent='Refill credits';
      body.innerHTML='<p>Add 1,000 free play credits to your balance.</p><button id="refill" class="dia-action">Add 1,000 credits</button>';
      $('refill').onclick=async()=>{await change(()=>{if(state.credits!==0||canDraw())return false;state.credits=initialCredits;});d.close();message='Credits added. Ready to deal.';render();};
    } else {
      $('dialogTitle').textContent=which==='royal' ? $('royalInfoLabel').textContent : '101% perfect play';
      body.innerHTML=which==='royal' ? royalDetails()+returnsText : returnsText+royalDetails();
    }
    d.setAttribute('aria-labelledby','dialogTitle'); if (!d.open) d.showModal();
    $('close').focus();
  }
  $('betDown').onclick=()=>step(-1); $('betUp').onclick=()=>step(1);
  for (const button of variantButtons) {
    button.addEventListener('click', () => selectGame(button.dataset.variant));
  }
  $('play').onclick=play; $('hint').onclick=bestHold;
  $('guide').onclick=()=>showDialog('guide'); $('returnInfo').onclick=()=>showDialog('return'); $('royalInfo').onclick=()=>showDialog('royal');
  $('session').onclick=()=>showDialog('session');
  $('close').onclick=()=>$('dialog').close();
  $('dialog').addEventListener('click',event=>{if(event.target!==$('dialog'))return;const rect=$('dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientY<rect.top||event.clientX>rect.right||event.clientY>rect.bottom)$('dialog').close();});
  $('sound').onclick=()=>{SpurSound.toggle();setSoundLabel();};
  window.addEventListener('keydown',event=>{
    if ($('dialog').open || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.repeat) { if (/^[1-5]$/.test(event.key) || event.code === 'Space') event.preventDefault(); return; }
    if (/^[1-5]$/.test(event.key)) {event.preventDefault();toggleCard(Number(event.key)-1);}
    else if (event.code==='Space') {event.preventDefault();play();}
  });
  window.addEventListener('storage',event=>{
    if(event.key!==storeKey) return;
    const restored=readSaved(); if(!restored)return;
    cancelAnimationFrame(tallyFrame); state=restored; message=''; clearHint(); render();
    if ($('dialog').open && activeDialog !== 'refill') showDialog(activeDialog);
  });
  render();setSoundLabel();
})();
