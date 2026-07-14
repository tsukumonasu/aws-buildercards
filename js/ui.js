/*
 * AWS BuilderCards 2nd Edition (非公式Web版) — UI 描画とユーザー操作
 */

let GAME = null;

function startNewGame() {
  document.getElementById('log').innerHTML = '';
  GAME = new Game(addLog);
  document.getElementById('result-overlay').classList.add('hidden');
  render();
}

function addLog(msg, cls) {
  const logEl = document.getElementById('log');
  const line = document.createElement('div');
  line.className = 'log-line' + (cls ? ' log-' + cls : '');
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function effBadges(eff) {
  if (!eff) return '';
  const b = [];
  if (eff.coins) b.push(`+$${eff.coins}`);
  if (eff.cards) b.push(`+${eff.cards}ドロー`);
  if (eff.buys) b.push(`+${eff.buys}購入`);
  return b.join(' ');
}

// セカンダリ条件の日本語表記
function reqLabel(req) {
  if (!req) return '';
  if (req.self) return `${CARD_DB ? '同' : ''}同名${req.self}枚`;
  if (req.cardId) return `${CARD_DB[req.cardId].name}と`;
  if (req.cardIds) return `${req.cardIds.map(id => CARD_DB[id].name).join('・')}のいずれかと`;
  if (req.categoryIn) {
    const labels = req.categoryIn.map(c => CATEGORY_LABEL[c] || c).join('・');
    return req.count ? `${labels}を${req.count}つと` : `${labels}と`;
  }
  if (req.any) return `どのAWSサービスとでも`;
  return '';
}

// シナジー1件を「条件→効果(perMatch表記)」の短い文字列にする
function synLabel(syn) {
  const g = effBadges(syn);
  const per = syn.perMatch ? '（1枚ごと）' : '';
  return `${reqLabel(syn.requires)}${per}→ ${g}`;
}

// カードの全シナジー配列を取得（旧secondary互換）
function cardSynergies(card) {
  return card.synergies || (card.secondary ? [card.secondary] : []);
}

/*
 * 手札のシナジー解析
 * 手札(hand: id配列)の中で、セカンダリ効果を発動できる組み合わせを検出する。
 * 発動条件は「必要カードが先に場に出ていること」なので、手札に両方あれば
 * プレイ順を工夫すれば発動可能 → 組み合わせとして提示する。
 * 戻り値: [{ trigger, partners:[id...], reqType, gain, label }]
 */
function analyzeHandSynergies(hand) {
  // 手札から発動可能な組み合わせを「候補」として列挙（表示・発動ボタン用）。
  // 1枚のカードが複数のシナジーに関与しうるので、ここでは排他制限をかけず、
  // 成立しうる組み合わせをすべて挙げる（実際の発動時の消費はエンジンが管理）。
  const combos = [];
  const seen = new Set(); // 重複列挙防止キー

  const orderIdx = hand.map((id, i) => i).sort((a, b) => {
    const ta = CARD_DB[hand[a]].type === 'builder' ? 0 : 1;
    const tb = CARD_DB[hand[b]].type === 'builder' ? 0 : 1;
    return ta - tb;
  });
  const catOf = j => CARD_DB[hand[j]].category;
  const isBuilder = j => CARD_DB[hand[j]].type === 'builder';

  for (const idx of orderIdx) {
    const id = hand[idx];
    const card = CARD_DB[id];
    const syns = cardSynergies(card);
    if (syns.length === 0) continue;

    for (const syn of syns) {
      const req = syn.requires || {};

      if (req.self) {
        // 同名がちょうど閾値以上あるとき、その閾値コンボを1回だけ列挙
        const sameIdxs = orderIdx.filter(j => hand[j] === id);
        const key = 'self#' + id + '#' + req.self;
        if (sameIdxs.length >= req.self && !seen.has(key)) {
          seen.add(key);
          const chosen = sameIdxs.slice(0, req.self);
          const realGain = effBadges({ coins: syn.coins||0, cards: syn.cards||0, buys: syn.buys||0 });
          combos.push({
            members: chosen.map(j => hand[j]), memberIdx: chosen,
            trigger: id, triggerIdx: idx, gain: realGain, reqType: 'self',
            label: `${card.name} を${req.self}枚プレイ → ${realGain}`
          });
        }
        continue;
      }

      // 非self系: 相手候補を探す（排他制限なし＝1枚を複数コンボの相手にできる）
      const cand = orderIdx.filter(j => j !== idx);
      let partnerIdxs = [];
      if (req.cardId) {
        const f = cand.filter(j => hand[j] === req.cardId);
        if (f.length === 0) continue;
        partnerIdxs = syn.perMatch ? f : f.slice(0, 1);
      } else if (req.cardIds) {
        const f = cand.filter(j => req.cardIds.includes(hand[j]));
        if (f.length === 0) continue;
        partnerIdxs = syn.perMatch ? f : f.slice(0, 1);
      } else if (req.categoryIn) {
        const f = cand.filter(j => req.categoryIn.includes(catOf(j)));
        if (req.count) { if (f.length < req.count) continue; partnerIdxs = f.slice(0, req.count); }
        else { if (f.length === 0) continue; partnerIdxs = syn.perMatch ? f : f.slice(0, 1); }
      } else if (req.any) {
        const f = cand.filter(j => isBuilder(j));
        if (f.length === 0) continue;
        partnerIdxs = syn.perMatch ? f : f.slice(0, 1);
      } else {
        continue;
      }

      const memberIdx = [...partnerIdxs, idx];
      // 重複コンボ（同じメンバー集合＋同じトリガー＋同じ効果）を防ぐ
      const key = 'pair#' + id + '#' + [...memberIdx].sort((a,b)=>a-b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);

      const factor = syn.perMatch ? partnerIdxs.length : 1;
      const realGain = effBadges({
        coins: (syn.coins||0)*factor, cards: (syn.cards||0)*factor, buys: (syn.buys||0)*factor
      });
      combos.push({
        members: memberIdx.map(j => hand[j]), memberIdx,
        trigger: id, triggerIdx: idx, gain: realGain,
        reqType: req.cardId ? 'cardId' : (req.cardIds ? 'cardIds' : (req.categoryIn ? 'categoryIn' : 'any')),
        label: `${reqLabel(req)}${card.name} をプレイ → ${realGain}`
      });
    }
  }
  return combos;
}

// 手札のうちシナジーに関与するカードidの集合を返す
function synergyCardIds(combos) {
  const set = new Set();
  combos.forEach(c => { c.members.forEach(m => set.add(m)); });
  return set;
}

function makeCardEl(id, opts = {}) {
  const card = CARD_DB[id];
  const el = document.createElement('div');
  el.className = 'card card-' + card.type;
  if (card.category) el.classList.add('cat-' + card.category);
  if (opts.disabled) el.classList.add('disabled');
  if (opts.clickable) el.classList.add(opts.clickable);

  const cat = card.category ? CATEGORY_LABEL[card.category] || card.category : '';
  let costBadge = '<span></span>';
  if (card.type === 'wa') costBadge = `<span class="card-cost">$${card.cost}</span>`;
  else if (card.type === 'onprem') costBadge = `<span class="card-onp">On-Prem</span>`;
  else if (card.free) costBadge = `<span class="card-free">FREE</span>`;
  else if (card.cost != null) costBadge = `<span class="card-cost">$${card.cost}</span>`;

  const coinCircle = (card.type === 'builder' && card.primary && card.primary.coins)
    ? `<span class="coin-circle">${card.primary.coins}</span>` : '';

  let effHtml = '';
  if (card.type === 'builder' && card.primary) {
    const pb = effBadges(card.primary);
    if (pb) effHtml += `<div class="card-eff primary">常時 ${pb}</div>`;
  }
  if (card.special === 'perAllCards') effHtml += `<div class="card-eff primary">場のカード1枚につき +$1</div>`;
  if (card.special === 'perAwsCard') effHtml += `<div class="card-eff primary">場のAWS枚数ぶん +$</div>`;
  if (card.special === 'recycleFromDiscard') effHtml += `<div class="card-eff special">捨札1枚を山札上へ</div>`;
  const syns = cardSynergies(card);
  syns.forEach(syn => {
    effHtml += `<div class="card-eff secondary">${synLabel(syn)}</div>`;
  });
  if (card.type === 'onprem' && syns.length === 0) effHtml += `<div class="card-eff none">効果なし（破棄対象）</div>`;
  if (card.vp) effHtml += `<div class="card-eff primary">勝利点 ${card.vp}★</div>`;

  el.innerHTML = `
    <div class="card-head">
      ${costBadge}
      ${coinCircle}
      ${card.vp ? `<span class="card-vp">${card.vp}★</span>` : ''}
    </div>
    <div class="card-name">${card.name}</div>
    ${cat ? `<div class="card-cat">${cat}</div>` : ''}
    ${effHtml}
    ${opts.count != null ? `<div class="card-count">残 ${opts.count}</div>` : ''}
    <div class="card-desc">${card.desc || ''}</div>
  `;
  return el;
}

function render() {
  if (!GAME) return;
  const you = GAME.players[0];
  const cpu = GAME.players[1];
  const yourTurn = GAME.current === 0 && !GAME.over;
  const setupPhase = GAME.phase === 'setup';
  const buildPhase = GAME.phase === 'build';
  const buyPhase = GAME.phase === 'buy';

  document.getElementById('turn-info').textContent = setupPhase
    ? 'ゲーム準備 — 初期カードを選択'
    : `ターン ${GAME.turnCount} / ${GAME.players[GAME.current].name} の手番`;
  document.getElementById('phase-info').textContent =
    setupPhase ? `⓪ 初期選択（残${GAME.setupPicksRemaining}枚）` : (buildPhase ? '① ビルドフェーズ' : '② 購入フェーズ');
  document.getElementById('coins-info').textContent = `$${GAME.coins}`;
  document.getElementById('buys-info').textContent = `購入 ${GAME.buys}`;
  document.getElementById('your-vp').textContent = you.totalVP();
  document.getElementById('cpu-vp').textContent = cpu.totalVP();

  document.getElementById('deck-count').textContent = you.deck.length;
  document.getElementById('discard-count').textContent = you.discard.length;
  document.getElementById('your-builders').textContent = you.builderCount();
  document.getElementById('your-onprem').textContent = you.onpremCount();

  document.getElementById('wa-info').textContent =
    `WA山: 1pt×${GAME.waSupply.wa1} / 3pt×${GAME.waSupply.wa3}`;

  // コンソール（コストフリー）
  const freeEl = document.getElementById('free-row');
  freeEl.innerHTML = '';
  GAME.freeRow.forEach((id, idx) => {
    if (!id) {
      const empty = document.createElement('div');
      empty.className = 'card card-empty';
      empty.innerHTML = '<div class="empty-slot">（山切れ）</div>';
      freeEl.appendChild(empty);
      return;
    }
    const canPick = setupPhase && GAME.setupPicksRemaining > 0;
    const canTake = yourTurn && buyPhase && GAME.buys > 0;
    const el = makeCardEl(id, { clickable: (canPick || canTake) ? 'takeable' : '' });
    if (canPick) el.addEventListener('click', () => { GAME.pickInitialFree(idx); render(); });
    else if (canTake) el.addEventListener('click', () => { GAME.takeFreeBuilder(you, idx); render(); });
    freeEl.appendChild(el);
  });
  const blindBtn = document.getElementById('btn-blind');
  blindBtn.disabled = !(yourTurn && buyPhase && GAME.buys > 0 && GAME.freeDeck.length > 0);
  blindBtn.textContent = `🗂 山札トップを引く（残${GAME.freeDeck.length}・拒否不可）`;
  const consoleHint = document.getElementById('console-hint');
  if (consoleHint) {
    consoleHint.textContent = setupPhase
      ? `🎴 ゲーム開始前に、コンソールから初期カードを${GAME.setupPicksRemaining}枚選んでください（クリック）`
      : '';
    consoleHint.classList.toggle('active', setupPhase);
  }

  // コストありビルダー（表向き1枚のみ購入可能。残りは山札）
  const paidEl = document.getElementById('paid-supply');
  paidEl.innerHTML = '';
  if (GAME.paidRow == null) {
    paidEl.innerHTML = '<div class="empty-hint">コストありビルダーは残っていません</div>';
  } else {
    const id = GAME.paidRow;
    const canBuy = yourTurn && buyPhase && GAME.buys > 0 && GAME.coins >= CARD_DB[id].cost;
    const el = makeCardEl(id, { count: GAME.paidDeck.length + 1, clickable: canBuy ? 'buyable' : '' });
    if (canBuy) el.addEventListener('click', () => { GAME.buyPaidBuilder(you, id); render(); });
    paidEl.appendChild(el);
  }

  // WA
  const waEl = document.getElementById('wa-supply');
  waEl.innerHTML = '';
  WA_SUPPLY_SETUP.forEach(s => {
    const count = GAME.waSupply[s.id];
    const canBuy = yourTurn && buyPhase && GAME.canBuyWA(s.id);
    let note = '';
    if (s.id === 'wa3' && GAME.waSupply.wa1 > 0) note = '（1pt完売まで購入不可）';
    const el = makeCardEl(s.id, { count, clickable: canBuy ? 'buyable' : '', disabled: count === 0 });
    if (note) { const n = document.createElement('div'); n.className = 'card-note'; n.textContent = note; el.appendChild(n); }
    if (canBuy) el.addEventListener('click', () => { GAME.buyWA(you, s.id); render(); });
    waEl.appendChild(el);
  });

  // 場
  const playEl = document.getElementById('inplay');
  playEl.innerHTML = '';
  you.inPlay.forEach(id => playEl.appendChild(makeCardEl(id)));
  if (you.inPlay.length === 0) playEl.innerHTML = '<div class="empty-hint">まだカードをプレイしていません</div>';

  // 捨て札パネル（CDK効果の保留中はここから選べる）
  renderDiscardPile();
  // リタイア置き場
  renderRetiredPile();

  // ── 手札とシナジー解析 ──
  const combos = analyzeHandSynergies(you.hand);
  const synIds = synergyCardIds(combos);
  // combo ごとに色インデックスを割り当て（ハイライト連動用）
  const comboColorOf = {}; // cardId -> [comboIndex,...]
  combos.forEach((c, ci) => {
    c.members.forEach(pid => {
      (comboColorOf[pid] = comboColorOf[pid] || []).push(ci);
    });
  });

  const handEl = document.getElementById('hand');
  handEl.innerHTML = '';
  const canRetireNow = yourTurn && buildPhase && GAME.canRetire(you);
  you.hand.forEach((id, idx) => {
    const card = CARD_DB[id];
    const playable = yourTurn && (buildPhase || buyPhase) && card.type !== 'wa';
    const el = makeCardEl(id, { clickable: playable ? 'playable' : '' });

    // シナジー関与カードに印
    if (synIds.has(id)) {
      el.classList.add('has-synergy');
      const cis = comboColorOf[id] || [];
      el.dataset.combos = cis.join(',');
      const badge = document.createElement('span');
      badge.className = 'synergy-badge';
      badge.textContent = '🔗';
      badge.title = '組み合わせでシナジー発動可能';
      el.appendChild(badge);
      // ホバーで同じcomboのカードを強調
      el.addEventListener('mouseenter', () => highlightCombos(cis));
      el.addEventListener('mouseleave', clearHighlight);
    }

    if (playable) el.addEventListener('click', () => { GAME.playCard(you, idx); render(); maybeShowRecycle(); });
    if (canRetireNow && card.type === 'onprem') {
      el.classList.add('retirable');
      const btn = document.createElement('button');
      btn.className = 'retire-btn'; btn.textContent = '✕ 破棄';
      btn.addEventListener('click', (e) => { e.stopPropagation(); GAME.retireFromHand(you, idx); render(); });
      el.appendChild(btn);
    }
    handEl.appendChild(el);
  });
  if (you.hand.length === 0) handEl.innerHTML = '<div class="empty-hint">手札がありません</div>';

  // シナジー組み合わせ一覧
  renderComboList(combos, yourTurn && (buildPhase || buyPhase));

  // リタイア案内
  const retireHint = document.getElementById('retire-hint');
  if (retireHint) {
    retireHint.textContent = canRetireNow
      ? '💡 手札のAWSカードが3枚以上あるので、オンプレを1枚リタイア（ゲームから除去）できます（「✕ 破棄」）'
      : '';
  }

  document.getElementById('btn-to-buy').disabled = !(yourTurn && buildPhase);
  document.getElementById('btn-endturn').disabled = !(yourTurn && buyPhase);

  document.getElementById('step-build').classList.toggle('active', buildPhase);
  document.getElementById('step-buy').classList.toggle('active', buyPhase);

  if (GAME.over) showResult();
}

// シナジー組み合わせ一覧の描画
function renderComboList(combos, active) {
  const box = document.getElementById('combo-list');
  if (!box) return;
  if (!active) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if (combos.length === 0) {
    box.innerHTML = '<div class="combo-empty">現在の手札で発動できるシナジーの組み合わせはありません。'
      + '手札のカードをクリックすると1枚ずつプレイできます。AWSカードを出すとクレジットが貯まります。</div>';
    return;
  }
  let html = '<div class="combo-title">🔗 手札で狙えるシナジー組み合わせ</div><ul class="combo-ul">';
  combos.forEach((c, ci) => {
    const names = [...new Set(c.members)].map(id => CARD_DB[id].name).join(' ＋ ');
    html += `<li class="combo-item" data-combo="${ci}">`
      + `<span class="combo-gain">${c.gain}</span> `
      + `<b>${names}</b> <span class="combo-how">（${c.label}）</span>`
      + `<button class="combo-play-btn" data-combo="${ci}">▶ この組み合わせを発動</button>`
      + `</li>`;
  });
  html += '</ul>';
  html += '<div class="combo-note">※「発動」を押すと必要なカードが正しい順で自動的に場に出ます。個別に手札をクリックしてプレイすることもできます。</div>';
  box.innerHTML = html;

  // 一覧ホバーで手札を強調
  box.querySelectorAll('.combo-item').forEach(li => {
    const ci = parseInt(li.dataset.combo, 10);
    li.addEventListener('mouseenter', () => highlightCombos([ci]));
    li.addEventListener('mouseleave', clearHighlight);
  });
  // 発動ボタン
  box.querySelectorAll('.combo-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ci = parseInt(btn.dataset.combo, 10);
      playCombo(combos[ci]);
    });
  });
}

/*
 * 指定した組み合わせを発動する。
 * 必要なカード（members）を「条件カード → トリガー」の順で手札から場に出す。
 * self（同名複数）の場合は同名カードを必要枚数プレイする。
 */
function playCombo(combo) {
  if (GAME.current !== 0 || (GAME.phase !== 'build' && GAME.phase !== 'buy')) return;
  const you = GAME.players[0];

  // combo.members は「条件カード → トリガー」の順（self は同名を必要枚数）。
  // 同名カードの取り違えを避けるため、必要な id を順に手札から1枚ずつ消費してプレイする。
  const order = [...combo.members];
  for (const id of order) {
    const idx = you.hand.findIndex(hid => hid === id);
    if (idx < 0) break; // 既にプレイ済み等
    GAME.playCard(you, idx);
  }
  render();
  maybeShowRecycle();
}

// CDK 効果: 人間プレイヤーが捨て札から1枚選んで山札トップへ
function maybeShowRecycle() {
  // CDK効果の保留状態は捨て札パネル上で選ばせる。描画は render() → renderDiscardPile() が担う。
  if (GAME && GAME.pendingRecycle && GAME.pendingRecycle.playerIndex === 0
      && GAME.players[0].discard.length === 0) {
    GAME.pendingRecycle = null;
  }
  render();
}

// 捨て札パネルの描画。CDKの保留中はカードをクリックで山札トップへ。
function renderDiscardPile() {
  const you = GAME.players[0];
  const pileEl = document.getElementById('discard-pile');
  const hintEl = document.getElementById('discard-hint');
  if (!pileEl) return;
  const recycling = !!(GAME.pendingRecycle && GAME.pendingRecycle.playerIndex === 0);

  if (hintEl) {
    hintEl.textContent = recycling
      ? '🔧 AWS CDK: 山札の一番上に置く（＝次に引く）カードを選んでください'
      : '';
    hintEl.classList.toggle('active', recycling);
  }

  pileEl.innerHTML = '';
  if (you.discard.length === 0) {
    pileEl.innerHTML = '<div class="empty-hint">捨て札はありません</div>';
    return;
  }
  you.discard.forEach((id, idx) => {
    const el = makeCardEl(id, { clickable: recycling ? 'takeable' : '' });
    if (recycling) {
      el.addEventListener('click', () => {
        GAME.recycleChosen(idx);
        render();
      });
    }
    pileEl.appendChild(el);
  });
}

// リタイア（ゲームから除去した）カードの置き場
function renderRetiredPile() {
  const you = GAME.players[0];
  const el = document.getElementById('retired-pile');
  if (!el) return;
  el.innerHTML = '';
  if (you.retired.length === 0) {
    el.innerHTML = '<div class="empty-hint">リタイアしたカードはありません</div>';
    return;
  }
  you.retired.forEach(id => {
    const c = makeCardEl(id, { disabled: true });
    el.appendChild(c);
  });
}

function highlightCombos(comboIndexes) {
  const set = new Set(comboIndexes.map(String));
  document.querySelectorAll('#hand .card').forEach(el => {
    const cs = (el.dataset.combos || '').split(',').filter(Boolean);
    if (cs.some(c => set.has(c))) el.classList.add('combo-highlight');
    else el.classList.add('combo-dim');
  });
  document.querySelectorAll('#combo-list .combo-item').forEach(li => {
    if (set.has(li.dataset.combo)) li.classList.add('combo-active');
  });
}

function clearHighlight() {
  document.querySelectorAll('#hand .card').forEach(el => {
    el.classList.remove('combo-highlight', 'combo-dim');
  });
  document.querySelectorAll('#combo-list .combo-item').forEach(li => {
    li.classList.remove('combo-active');
  });
}

function toBuyPhase() {
  if (GAME.current !== 0 || GAME.phase !== 'build') return;
  // 手札は自動プレイしない。プレイしていないカードはそのまま手札に残り、
  // 購入フェーズへ移行する（未プレイのクレジットは使えない）。
  GAME.phase = 'buy';
  render();
}

function endTurn() {
  if (GAME.current !== 0) return;
  GAME.endTurn();
  render();
  if (!GAME.over && GAME.current === 1) setTimeout(runCpuTurn, 700);
}

function runCpuTurn() {
  if (GAME.over || GAME.current !== 1) return;
  cpuTakeTurn(GAME);
  render();
  setTimeout(() => {
    if (GAME.over) { render(); return; }
    GAME.endTurn();
    render();
    if (!GAME.over && GAME.current === 1) setTimeout(runCpuTurn, 700);
  }, 1000);
}

function showResult() {
  const scores = GAME.result();
  const overlay = document.getElementById('result-overlay');
  let title = scores.draw ? '引き分け' : `${scores.find(s => s.winner).name} の勝ち！`;
  let html = `<div class="result-box"><h2>🏁 ゲーム終了</h2><p class="winner">${title}</p><table>`;
  html += '<tr><th>プレイヤー</th><th>勝利点</th><th>AWS枚数</th><th>総カード</th></tr>';
  scores.forEach(s => {
    html += `<tr class="${s.winner ? 'win' : ''}"><td>${s.name}</td><td>${s.vp}★</td><td>${s.builders}</td><td>${s.cards}</td></tr>`;
  });
  html += '</table><p class="result-note">勝敗: 勝利点 → 同点は AWS カード枚数 → それも同数は引き分け</p>';
  html += '<button onclick="startNewGame()">もう一度プレイ</button></div>';
  overlay.innerHTML = html;
  overlay.classList.remove('hidden');
}

function toggleGuide() { document.getElementById('guide-overlay').classList.toggle('hidden'); }
function toggleRules() { document.getElementById('rules-overlay').classList.toggle('hidden'); }

function buildGuide() {
  const g = document.getElementById('guide-cards');
  if (!g) return;
  Object.keys(CARD_DB).forEach(id => g.appendChild(makeCardEl(id)));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-new').addEventListener('click', startNewGame);
  document.getElementById('btn-to-buy').addEventListener('click', toBuyPhase);
  document.getElementById('btn-blind').addEventListener('click', () => { GAME.takeFreeBlind(GAME.players[0]); render(); });
  document.getElementById('btn-endturn').addEventListener('click', endTurn);
  document.getElementById('btn-guide').addEventListener('click', toggleGuide);
  document.getElementById('btn-guide-close').addEventListener('click', toggleGuide);
  document.getElementById('btn-rules').addEventListener('click', toggleRules);
  document.getElementById('btn-rules-close').addEventListener('click', toggleRules);
  buildGuide();
  setupCollapsibles();
  startNewGame();
});

// 各パネルに折りたたみボタンを付与し、タイトル以外を開閉できるようにする
function setupCollapsibles() {
  document.querySelectorAll('main .panel').forEach(panel => {
    const title = panel.querySelector('.panel-title');
    if (!title) return;
    if (title.querySelector('.collapse-btn')) return; // 二重付与防止
    const btn = document.createElement('button');
    btn.className = 'collapse-btn';
    btn.textContent = '−';
    btn.title = '折りたたむ／開く';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? '＋' : '−';
    });
    title.appendChild(btn);
  });
}
